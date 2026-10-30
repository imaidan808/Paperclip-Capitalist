// The 2.5D world: an isometric island of sixteen districts that mirrors the live game. Canvas 2D only; no assets, no dependencies.
// This file is the ENGINE (owner: T5 RASTER QUALITY, docs/RENDER_PLAN.md): the camera, input, hit testing, the sync with the game, the frame loop, the quality governor and the order
// the frame is drawn in (draw(): the layer stack of stack.js). What each layer looks like lives in its owner's module, mixed into World.prototype at the foot of this file.
//   - every game object is something you can see: buyers walk in, lots and stock are crates, pipelines are buildings, freight is trucks
//   - the virtual hour sets the light, macro shocks set the weather, a locked district lies under fog until its gate opens
//   - clicking a thing performs the real action through api.activate()
//   - only what is on screen is drawn (districts, props and ground are culled; far away they fall back to plain blocks)
// The presentation layer beside this file: lighting.js (grade, light pools), fx.js (particle pool, dust, rain), labels.js (crisp label sprites), gfx.js (offscreen helpers), lod.js (zoom bands),
// palette.js, solids.js and shadow.js (the art direction's colours, rounded solids and soft shadows).
import { ASSETS, BUYERS, PIPE, ZONES } from '../config.js';
import { P, sx, sy, HW, HH, toGrid, box, shadow, person, clamp, lerp, ease, h2, strHash } from './iso.js';
import { LAYOUT, DIST, SPOTS, PLOTS, SCENERY, BW, BD, zAt, zoneAt } from './layout.js';
import { Fx } from './fx.js';
import { Lighting, dayTargets } from './lighting.js';
import { Labels } from './labels.js';
import { surface, softwareRaster, releaseAll, ledger, LEDGER_LIMIT_MB, builds } from './gfx.js';
import { snapTranslation } from './chunks.js';
import { SLOW_MS, FAST_MS, GOV_WAIT, GOV_DOWN, BUILD_GRACE, judge } from './governor.js';
import { clearSprites, setSpriteBudget, trimSprites } from './sprites.js';
import { FAR_ZOOM, FOG_DIM, money, leaveEnd } from './common.js';
import { runLayer } from './stack.js';
import { releaseShadows } from './shadow.js';
import { lodOf, farMix } from './lod.js';
import { lookOf, CARS } from './ents-actors.js';
import { seaMethods } from './sea.js';
import { groundMethods } from './ground.js';
import { coastMethods } from './coast.js';
import { terrainMethods } from './terrain.js';
import { roadMethods } from './roads.js';
import { decalMethods } from './decals.js';
import { groundCacheMethods } from './groundcache.js';
import { cloudMethods, shrinkClouds } from './clouds.js';
import { atmosMethods } from './atmos.js';
import { staticMethods } from './statics.js';
import { plotMethods } from './ents-plots.js';
import { actorMethods } from './ents-actors.js';
import { stockMethods } from './ents-stock.js';
import { overlayMethods } from './overlay.js';
import { mapMethods } from './mapmode.js';
export { FAR_ZOOM };                                                                  // below this zoom the world draws plain blocks and dots (common.js)
import { ZoomInput } from './camera-input.js';

export { SLOW_MS, FAST_MS };               // quality governor (governor.js): a smoothed frame cost over SLOW_MS steps quality down, under FAST_MS steps it back up
const SOFT_DPR = 1.5;                      // the most pixel density a CPU-drawn canvas gets: every full-window layer is a pass over all its pixels, and 1.5 has 44% fewer of them than 2
const BY_KEY = (a, b) => a.key - b.key;
const NOFX = Object.freeze({ dim: 0, fog: 0, lights: 0 });
const REVEAL_MS = 2600;
const HOT = new Map(SCENERY.filter((p) => p.hot).map((p) => [p.hot, p]));
const ENT_KINDS = new Set(['lead', 'lot', 'asset', 'pipe', 'plot', 'truck']); // the entity types that are layers of their own (stack.js)

export class World {
  /** @param {{session, ui, activate:(hit)=>void, hover?:(hit,ev)=>void, reveal?:(zone)=>void}} api */
  constructor(api) {
    this.api = api;
    this.cv = document.createElement('canvas');
    this.cv.className = 'worldcv'; this.cv.tabIndex = 0;
    this.cv.setAttribute('role', 'application');
    this.cv.setAttribute('aria-label', 'Isometric world of sixteen districts. Drag to look around, scroll or pinch to zoom, plus and minus also zoom, 0 shows the whole island, arrow keys to pan. Every object here is also in the list below the map.');
    this.ctx = this.cv.getContext('2d', { alpha: false });
    this.mini = document.createElement('canvas'); this.mini.width = 150; this.mini.height = 96; this.mini.className = 'worldmini'; this.mini.setAttribute('aria-hidden', 'true'); this.mctx = this.mini.getContext('2d');
    this.cam = { x: 0, y: 0, z: 0.9 }; this.camTo = null;
    this.zin = new ZoomInput({ zoom: () => this.cam.z, apply: (z, px, py) => this.zoomAbout(z, px, py), range: () => this.zoomRange(), size: () => [this.W, this.H], instant: () => this.reduced() || !this.running, touching: () => this.pointers.size > 1, gliding: () => !!this.camTo }); // wheel, trackpad and Safari-gesture zoom (camera-input.js); two fingers down are zoomed by the pointer events already, a glide of the camera's own is not broken by a scroll's momentum
    this.mode = 'world';
    this.W = 800; this.H = 500; this.dpr = 1;
    this.inset = { l: 0, r: 0 };                                                                // px of the window's left and right edges that the camera buttons stand over: the island is fitted to what they leave
    this.ents = new Map(); this.lights = []; this.hits = []; this.overlay = [];
    this.hover = null; this.focusKey = null; this.t = 0; this.vt = 0; this.last = 0; this.night = 0; this.dusk = 0; this.fps = 30; this.slow = 0; this.warm = 0; this.lite = false;
    // presentation layer: particles, lighting, label sprites, and the draw loop's reusable scratch (nothing here is game state)
    this.fx = new Fx(); this.light = new Lighting(); this.light.perFrame = 1; this.labels = new Labels(); this.rainOn = false;
    this.gov = { cost: 0, bad: 0, good: 0, wait: GOV_WAIT, upAt: -1e9, prev: 0 };            // the quality governor's smoothed state
    this.waterGr = null; this.seaStrip = undefined; this.seaKey = -1;                          // the sea: its colours for the light step, and the one strip it is painted into (made on first use)
    this.gc = null; this.gcKey = new Float64Array(9); this.gcSeen = 0; this.gcValid = false; // the ground cache: an offscreen copy of the terrain for a still camera
    this.items = []; this.itemPool = []; this.vz = new Set(); this.carList = Array.from({ length: CARS }, () => ({ gx: 0, gy: 0, i: 0, key: 0, horiz: true, fade: 1 }));
    this.vis = true; this.dprDown = false; this.mm = null; this.mmFn = null; this.ledLast = undefined; this.tod = { night: 0, dusk: 0 }; this.unlockHash = 0; this.itemN = 0;                                                         // is the canvas on screen; the last ledger entry the world has seen
    this.lod = lodOf(0.9); this.gnd = { zoom: 1, far: false, mode: 0, see: null };                // the zoom's level-of-detail record (lod.js) and the ground pass's record for its layers (stack.js), both reused every frame
    this.decals = new Map();                                                                      // per district: its animated decals (water, pulses) drawn live over the cached ground
    this.player = { x: 0, y: 0, path: [], zone: 1, moving: false, dir: 1, speed: 16, placed: false };
    this.zpip = new Uint8Array(3 * (Math.max(...LAYOUT.ids) + 1));                                // per district: pipelines running, paused, starved (for the whole-island pips)
    this.env = { t: 0, night: 0, wind: 1, dim: 0, tier: 0, farMix: 1, surge: false, crunch: false, tariff: false, far: false, lite: false, locked: false, zoff: 0, lights: this.lights };
    this.reveal = {}; this.far = false;
    this.running = false; this.dirty = true; this.pointers = new Map(); this.drag = null; this.hitsLabel = {};
    this.bindInput();
    this.fit(false);
  }
  get g() { return this.api.session.game; }
  /** Is motion reduced (the page's own setting, or the system's)? Called many times a frame, so the media query is made once and read live (`matches` follows the system). */
  reduced() {
    if (document.documentElement.dataset.motion === 'reduce') return true;
    if (typeof matchMedia !== 'function') return false;
    if (this.mmFn !== matchMedia) { this.mmFn = matchMedia; this.mm = matchMedia('(prefers-reduced-motion: reduce)'); } // a new matchMedia (a test's stand-in) is asked afresh
    return !!this.mm?.matches;
  }

  // ------------------------------------------------------------------ lifecycle
  attach(host) {
    host.replaceChildren(this.cv);
    this.host = host;
    if (!this.ro) { this.ro = new ResizeObserver(() => this.resize()); }
    this.ro.disconnect(); this.ro.observe(host);
    // a canvas that is not on screen (a hidden panel, a covered tab) is not drawn: the loop keeps its place and costs nothing until it is seen again
    if (typeof IntersectionObserver === 'function') {
      if (!this.io) this.io = new IntersectionObserver((es) => { const v = es[es.length - 1].isIntersecting; if (v && !this.vis) { this.dirty = true; this.warm = Math.max(this.warm, 4); } this.vis = v; });
      this.io.disconnect(); this.io.observe(this.cv);
    }
    this.resize();
    this.start();
  }
  detach() { this.stop(); this.ro?.disconnect(); this.io?.disconnect(); this.vis = true; this.release(); }
  /**
   * Give back every bitmap the world holds for its size: the ground cache, the sea, the light layers, the label sprites and the scenery sprites. Called when the screen goes
   * away (the world and its stage can stay reachable from a handler that outlives the screen, and the bitmaps are tens of megabytes at 2x); a world that is attached again
   * makes what it needs again on demand, exactly as after a resize.
   */
  release() {
    this.releaseGround(); this.waterGr = null; this.seaStrip = undefined; this.seaKey = -1;
    this.light.release(); this.labels.release(); clearSprites(); releaseShadows(); releaseAll(); this.ledgerSync(); // (releaseAll: every holder a module registered through gfx.js's registerReleaser)
  }
  /**
   * Tell the pixel ledger (gfx.js) what the world holds that no module registers for itself: the canvas, the light layers and the label sprites (the sprites, the ground chunks and the sea register their own). Called when the
   * size changes and every couple of seconds; cheap (a sum over a few dozen surfaces).
   */
  ledgerSync() {
    const px = (c) => (c ? ((c.c || c).width * (c.c || c).height) || 0 : 0), L = this.light;
    ledger.register('canvas.main', this.cv.width * this.cv.height * 4);
    ledger.register('light', 4 * (L ? [...Object.values(L.big || {}), ...Object.values(L.src || {})].reduce((a, c) => a + px(c), 0) : 0));
    ledger.register('labels', 4 * [...(this.labels.cache.m?.values() || [])].reduce((a, c) => a + (c && c.c ? c.c.width * c.c.height : 0), 0));
  }
  /**
   * The pixel ledger is over its ceiling (docs/RENDER_PLAN.md section 6: 160 MB at density 2): give some back, cheapest to rebuild first. Sprites go to 70% of their budget (overlays first), then chunks that are not in view
   * or are stale down to what the window touches, then the label sprites. Answers whether the ledger is within the ceiling afterwards. The picture does not change: what was dropped is made again on demand.
   */
  squeeze() {
    if (ledger.within()) return true;
    trimSprites(0.7); this.ledgerSync();
    if (!ledger.within() && this.gc && typeof this.gc.shrink === 'function') { const win = this.gcCells; this.gc.shrink(Math.max(8, Math.ceil(this.gc.size * 0.6)), win, this.renderScale()); this.ledgerSync(); }
    if (!ledger.within() && shrinkClouds(this)) this.ledgerSync();
    if (!ledger.within()) { this.labels.cache.clear(); this.ledgerSync(); }
    return ledger.within();
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.raf = 0; this.zin.cancel(); }
  /**
   * The pixel density the canvas is drawn at. The screen's own, to 2; at most SOFT_DPR where the canvas is drawn on the CPU. The quality governor takes a quarter off at
   * its fourth tier, and puts it back only below its second: a picture that tips between two tiers must not reallocate the canvas (and every layer made for it) each time.
   */
  targetDpr() {
    const native = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const top = native > SOFT_DPR && softwareRaster() ? SOFT_DPR : native;
    if (this.slow > 3) this.dprDown = true; else if (this.slow <= 1) this.dprDown = false;
    return Math.max(1, top * (this.dprDown ? 0.75 : 1));
  }
  resize() {
    const r = this.host.getBoundingClientRect(); if (!r.width) return;
    this.W = Math.max(1, Math.floor(r.width)); this.H = Math.max(1, Math.floor(r.height));
    this.dpr = this.targetDpr(); this.warm = 30;
    this.refreshInset(); setSpriteBudget(this.dpr);
    this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; this.ledgerSync();
    this.gcValid = false; this.labels.setDpr(this.dpr); // what was made for the old size is made again on demand: the ground's chunks are the same at any window size (they are cut by scale, not by window), and a new density is a new scale the sweep tells from the old
    this.dirty = true;
    if (this.g && this.unlocked) this.draw(); // a resized canvas is blank until redrawn: never show that gap
  }

  // ------------------------------------------------------------------ camera
  bounds() { return LAYOUT.bounds; }
  /**
   * The camera buttons stand over one edge of the window (the left in the wide layouts, the right in a phone's bottom-sheet layout), so the whole island is fitted to the
   * part they leave free. The page says how much they cover (`api.insets`, measured from the real buttons) when the window changes size and before a fit; the maths here never
   * touches the page. With nothing covered everything below is exactly the plain fit.
   */
  refreshInset() { const i = this.api.insets?.() || null, I = this.inset; I.l = i ? Math.max(0, Math.round(i.l) || 0) : 0; I.r = i ? Math.max(0, Math.round(i.r) || 0) : 0; if (I.l + I.r > this.W * 0.4) I.l = I.r = 0; /* a nonsense reading is no reading */ }
  fitZoom() { const b = this.bounds(), I = this.inset; return Math.min((this.W - I.l - I.r) / (b.x1 - b.x0), this.H / (b.y1 - b.y0)) * 0.98; }
  zoomRange() { return this.mode === 'map' ? [this.fitZoom() * 0.9, 1.4] : [Math.min(0.5, this.fitZoom()), 2.4]; }
  fit(animate = true) { this.refreshInset(); const b = this.bounds(), z = this.fitZoom(), I = this.inset; this.goTo((b.x0 + b.x1) / 2 - (I.l - I.r) / 2 / z, (b.y0 + b.y1) / 2, z, animate); } // the island's middle at the middle of the free part
  /** Frame one district: its whole block fills the view. */
  focusZone(z, animate = true) {
    const d = DIST[z]; if (!d) return;
    const zoom = clamp(Math.min(this.W / 1330, this.H / 830), 0.4, 1.25);
    this.goTo(sx(d.cx, d.cy), sy(d.cx, d.cy, d.z) - 20, zoom, animate);
  }
  goTo(x, y, z, animate = true) {
    this.zin.cancel(); // a move of the camera's own ends any wheel ease
    if (!animate || this.reduced()) { this.cam = { x, y, z }; this.camTo = null; this.clampCam(); } else this.camTo = { x, y, z, t0: this.t, from: { ...this.cam }, dur: 650 };
    this.dirty = true;
  }
  clampCam() {
    const b = this.bounds(), [lo, hi] = this.zoomRange(); this.cam.z = clamp(this.cam.z, lo, hi);
    // the camera is clamped by the middle of the free part of the window (the whole window when no button stands over it): `ox` is how far that middle is right of the canvas's
    const z = this.cam.z, I = this.inset, ox = (I.l - I.r) / 2, hw = (this.W - I.l - I.r) / 2 / z, hh = this.H / 2 / z, mx = Math.min(hw, (b.x1 - b.x0) / 2), my = Math.min(hh, (b.y1 - b.y0) / 2);
    this.cam.x = clamp(this.cam.x + ox / z, b.x0 + mx, b.x1 - mx) - ox / z;
    this.cam.y = clamp(this.cam.y, b.y0 + my, b.y1 - my);
  }
  /** Zoom by a factor about a screen point (the camera buttons, the keyboard, a two-finger touch pinch): at once. It ends a wheel ease, and steps on from where that ease was going. */
  zoomBy(f, px = this.W / 2, py = this.H / 2) { this.zoomAbout((this.zin.settle() ?? this.cam.z) * f, px, py); }
  /** Set the zoom, keeping the world point under a screen point where it is: the one place the camera is zoomed (the wheel, a trackpad pinch, Safari's gestures and the ease all come through here). */
  zoomAbout(z, px = this.W / 2, py = this.H / 2) {
    // The anchor is worked out from the camera's own numbers, never from origin(): the picture is drawn from a translation rounded to whole device pixels, and an anchor taken from the rounded one would add that rounding twice (before and after)
    const cam = this.cam, hw = this.W / 2, hh = this.H / 2, bx = (px - hw) / cam.z + cam.x, by = (py - hh) / cam.z + cam.y;
    cam.z = z; this.clampCam();
    cam.x += bx - ((px - hw) / cam.z + cam.x); cam.y += by - ((py - hh) / cam.z + cam.y); this.clampCam(); this.camTo = null; this.dirty = true; this.rebaseDrag();
  }
  /** One pointer is panning and the zoom changed under it: take hold of the ground where it is now, or the next move would work the camera out from where the drag began and the ground would slide off. */
  rebaseDrag() { const d = this.drag; if (!d || this.pointers.size !== 1) return; const [p] = [...this.pointers.values()]; if (d.moved) { d.x = p.x; d.y = p.y; } d.cx = this.cam.x; d.cy = this.cam.y; }
  /**
   * Where the world's origin is on the screen, in css pixels: the camera's translation rounded to whole DEVICE pixels, divided by the density. The picture is drawn from this (toWorld), so everything that is placed by it
   * (labels, tags, map cards, hit testing) lands where the ground and the sprites do: a pan moves them all by the same whole pixels. `out` is reused ([x, y]).
   */
  origin(out = this._o || (this._o = [0, 0])) { const a = this.renderScale(), s = this._os || (this._os = [0, 0]); snapTranslation(this.W, this.H, this.dpr, this.cam.x, this.cam.y, a, s); out[0] = s[0] / this.dpr; out[1] = s[1] / this.dpr; return out; }
  w2s(x, y) { const o = this.origin(), k = this.renderScale() / this.dpr; return [x * k + o[0], y * k + o[1]]; }
  s2w(x, y) { const o = this.origin(), k = this.renderScale() / this.dpr; return [(x - o[0]) / k, (y - o[1]) / k]; }
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
      this.zin.seen(e.offsetX, e.offsetY, e.pointerType !== 'touch'); // where the pointer is, drag or no drag: a zoom under it looks again from here
      if (p) { p.x = e.offsetX; p.y = e.offsetY; }
      if (this.pointers.size > 1 && this.drag) { const d = this.pinchDist(); if (this.drag.pinch) { const mid = this.pinchMid(); if (this.drag.mid) { this.cam.x -= (mid[0] - this.drag.mid[0]) / this.cam.z; this.cam.y -= (mid[1] - this.drag.mid[1]) / this.cam.z; this.clampCam(); } this.zoomBy(d / this.drag.pinch, mid[0], mid[1]); this.drag.pinch = d; this.drag.mid = mid; this.drag.moved = true; } return; }
      if (this.drag && p) {
        const dx = e.offsetX - this.drag.x, dy = e.offsetY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 6) { this.drag.moved = true; cv.style.cursor = 'grabbing'; }
        if (this.drag.moved) { this.cam.x = this.drag.cx - dx / this.cam.z; this.cam.y = this.drag.cy - dy / this.cam.z; this.clampCam(); this.camTo = null; this.zin.cancel(); this.dirty = true; }
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
    cv.addEventListener('pointerleave', () => { this.zin.left(); if (!this.drag) { this.hover = null; this.api.hover?.(null); this.dirty = true; } });
    // Zoom: the wheel (a mouse notch, a trackpad's two-finger scroll, a trackpad pinch in Chrome, Edge and Firefox) and Safari's pinch gestures. Only events aimed at the canvas get here:
    // the listeners are on the canvas, which has no children, so the HUD, the drawers and dialogs (siblings above it) never reach them and keep their own wheel. `mine` is a second lock
    // for the day the canvas has children. None of them may scroll, zoom or navigate the page, so every one is cancelled (these listeners are not passive). tests/camera-input.test.mjs
    // holds the structure in a real browser.
    const mine = (e) => !e.target || e.target === cv;
    cv.addEventListener('wheel', (e) => { if (!mine(e)) return; e.preventDefault(); this.zin.wheel(e); }, { passive: false });
    cv.addEventListener('gesturestart', (e) => { if (!mine(e)) return; e.preventDefault(); this.zin.gestureStart(e, cv.getBoundingClientRect()); }, { passive: false });
    cv.addEventListener('gesturechange', (e) => { if (!mine(e)) return; e.preventDefault(); this.zin.gestureChange(e, cv.getBoundingClientRect()); }, { passive: false });
    cv.addEventListener('gestureend', (e) => { if (!mine(e)) return; e.preventDefault(); this.zin.gestureEnd(); }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // never swallow the browser's own zoom and navigation shortcuts
      if (e.key === '0') { e.preventDefault(); this.fit(true); return; }
      const step = 60 / this.cam.z; let h = true;
      if (e.key === 'ArrowLeft') this.cam.x -= step; else if (e.key === 'ArrowRight') this.cam.x += step; else if (e.key === 'ArrowUp') this.cam.y -= step; else if (e.key === 'ArrowDown') this.cam.y += step;
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.2); else if (e.key === '-') this.zoomBy(1 / 1.2); else h = false;
      if (h) { e.preventDefault(); this.clampCam(); this.camTo = null; this.zin.cancel(); this.dirty = true; }
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
  /** The camera moved (a zoom, a key, a glide, a drag that has ended) under a mouse that did not: what is under it is not what was, so look again, once a drawn frame, and never while it is panning. */
  repickHover() {
    const c = this.cam, s = this.camSeen;
    if (this.drag || (s && s[0] === c.x && s[1] === c.y && s[2] === c.z)) return;
    this.camSeen = [c.x, c.y, c.z];
    const p = this.zin.resting(); if (p) this.pointerAt(p[0], p[1], { offsetX: p[0], offsetY: p[1] });
  }
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
    this.unlocked = unlocked; this.unlockHash = strHash([...unlocked].join()) + 1; // part of the ground cache's key: a district opening redraws the ground
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
    this.observeSales(g);
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
  startReveal(z) { if (!this.reduced()) { this.reveal[z] = { t0: this.t, dur: REVEAL_MS }; this.revealBurst(z); } this.api.reveal?.(z); this.dirty = true; }
  /** The opening of a district, as light: two rings open out along its ground and sparks rise from it. Under reduced motion there is no reveal, so none of this runs. */
  revealBurst(z) {
    const D = DIST[z], F = D?.fp; if (!F) return;
    const [x, y] = P(F[0] + F[2] / 2, F[1] + F[3] / 2, D.z), r = (F[2] + F[3]) * 12;
    this.fx.ring(x, y, 24, r * 0.62, 1.2); this.fx.ring(x, y, 12, r * 0.9, 1.9); this.fx.sparks(x, y - 10, 28, z * 31 + 7, r * 0.5, 70);
  }
  /**
   * Celebrate what the ledger has just recorded. Read-only: it looks at the entries after the last one it saw, the way a person reads the news, and
   * never touches the game. A sale throws coins (sparks only when it lost money) from the buyer who just walked off; a ledger it cannot place is not celebrated.
   */
  observeSales(g) {
    const L = g.s.ledger, n = L.length; if (!n) { this.ledLast = null; return; } // null: it was empty when last looked at, so whatever appears next is new
    const last = L[n - 1]; if (last === this.ledLast) return;
    let first = n; // undefined (never looked), or a ledger it cannot place (a new game, a trimmed one): nothing in it is news
    if (this.ledLast === null) first = 0;
    else if (this.ledLast !== undefined) { let i = n - 1; const stop = Math.max(0, n - 60); while (i >= stop && L[i] !== this.ledLast) i--; if (i >= stop) first = i + 1; }
    this.ledLast = last;
    if (first >= n || this.reduced() || !this.unlocked) return;
    const now = g.s.hour; let shown = 0;
    for (let k = n - 1; k >= first && shown < 3; k--) {
      const ev = L[k], sale = ev.type === 'pitch' && ev.recv != null, pool = ev.type === 'pool' && ev.amt > 0;
      if ((!sale && !pool) || ev.h < now - 3) continue;
      let who = null; if (sale) for (const e of this.ents.values()) if (e.type === 'lead' && e.leaving && e.zone === ev.z && e.seg === ev.seg && e.leaveAt === this.t) { who = e; break; }
      const pl = this.player, at = who || pl, [px, py] = P(at.x, at.y, zAt(at.x, at.y));
      if (ev.amt > 0) this.fx.coins(px, py - 26, 9, k); this.fx.sparks(px, py - 26, ev.amt > 0 ? 10 : 4, k, 12, 44); this.fx.ring(px, py, 6, 30, 0.7); shown++;
    }
  }
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
    if (!this.reduced()) { const x = sx(pl[0] + 1.5, pl[1] + 1.5), y = sy(pl[0] + 1.5, pl[1] + 1.5, D.z + 40 + p.level * 12); this.fx.coins(x, y, 8, e.cycles); if (amt > 0) this.fx.sparks(x, y, 6, e.cycles, 16, 40); }
  }
  pop(text, gx, gy, z, color = '#ffd36e') { this.fx.pop(text, sx(gx, gy), sy(gx, gy, z), color); }

  // ------------------------------------------------------------------ frame loop
  frame(ts) {
    if (!this.running) return;
    this.raf = 0;
    if (document.hidden) { this.raf = requestAnimationFrame((t) => this.frame(t)); return; } // a hidden tab costs nothing (its callbacks do not run); one stays pending so the loop is alive when it is shown
    if (!this.vis) return;                       // a canvas that is not on screen costs nothing: the observer that sees it again marks it dirty, which wakes the loop
    const calm = this.reduced(), G = this.gov;
    const animating = !calm || this.camTo || this.zin.pending || this.player.path.length || this.fx.active || this.revealing();
    if (!animating && !this.dirty) { G.prev = 0; return; } // nothing moves and nothing changed: no frame is asked for at all (a still picture), and the pause is never judged as a slow frame; the setter of `dirty` wakes the loop
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    if (ts - this.last < 1000 / this.fps - 1) return;
    const t0 = performance.now(), b0 = builds.n, gap = animating && G.prev && ts - G.prev < 250 ? ts - G.prev : 0; // the gap between two CONTINUOUS drawn frames (0 after a pause, and 0 for a frame drawn on demand: the redraws of a still picture are a quarter second apart and are not late)
    this.last = ts; this.t = ts;
    this.update(dt);
    this.draw();
    this.dirty = false; G.prev = animating ? ts : 0; this.repickHover();
    this.govern(performance.now() - t0, gap, builds.n !== b0); // (a frame that filled a cache is not judged: governor.js BUILD_GRACE)
    if ((this.ledgerN = (this.ledgerN | 0) + 1) % 20 === 0) { this.ledgerSync(); if (!ledger.within(LEDGER_LIMIT_MB)) this.squeeze(); } // every few seconds: the pixel ledger against its ceiling
    this.fps = this.slow > 4 ? 15 : this.slow > 2 ? 20 : 30; if (this.moving && this.slow < 3) this.fps = 60; // the 30 fps cap is for a still camera's idle motion: a camera that moves draws every refresh while the machine keeps up (docs/RENDER_PLAN.md section 5, DIAGNOSIS P4)
    this.lite = this.slow > 2;
    if (Math.abs(this.targetDpr() - this.dpr) > 0.01) this.resize();
  }
  /** Is the picture out of date? Setting it asks the loop for a frame when the loop has gone idle (a still picture asks for none), so every `this.dirty = true` in this file and its mixins is also a wake-up. */
  get dirty() { return this._dirty; }
  set dirty(v) { this._dirty = v; if (v && this.running && !this.raf) this.raf = requestAnimationFrame((t) => this.frame(t)); }
  /** Is any district still opening? One that has finished is swept here (fxOf only sweeps the districts in view, and a reveal nobody looks at must not hold the ground cache off). */
  revealing() { let on = false; for (const k in this.reveal) { const r = this.reveal[k]; if (this.t - r.t0 >= r.dur) delete this.reveal[k]; else on = true; } return on; }
  /**
   * The quality governor. `slow` (0 to 6) is the tier. It steps down after a few frames of smoothed cost over SLOW_MS and back up only after a longer
   * spell under FAST_MS, so a single hitch changes nothing. If the picture tips over again soon after a step up, the wait for the next step up doubles
   * (to forty times at most): a machine on the edge settles on the lower tier instead of flickering between two looks. A frame that arrives more than
   * two intervals late counts as slow however cheap its drawing was (the raster or the GPU is behind, which the drawing's own time cannot show).
   * The first frames after a resize are never judged (`warm`): a cold canvas and a fresh surface cost more than the steady state.
   */
  govern(cost, gap, built = false) {
    const G = this.gov;
    if (this.warm > 0) { this.warm--; return; }
    // A frame that filled a cache paid a cost that is not repeated, and the one after it arrives late because of it: neither says what a steady frame costs (governor.js BUILD_GRACE says why, and how long this lasts).
    if (built) { if ((G.run = (G.run | 0) + 1) <= BUILD_GRACE) { G.after = true; return; } } else G.run = 0;
    if (G.after) { G.after = false; gap = 0; }
    G.cost += (judge(cost, gap, this.fps) - G.cost) * 0.2; // (the second signal: a frame that arrives late for the loop's own target counts as slow however cheap its drawing was; governor.js)
    if (G.cost > SLOW_MS) {
      G.good = 0;
      if (++G.bad >= GOV_DOWN && this.slow < 6) { G.bad = 0; this.slow++; if (this.t - G.upAt < 6000) G.wait = Math.min(G.wait * 2, GOV_WAIT * 40); }
    } else if (G.cost < FAST_MS) {
      G.bad = 0;
      if (this.slow > 0 && ++G.good >= G.wait) { G.good = 0; this.slow--; G.upAt = this.t; }
      if (this.slow === 0) G.wait = GOV_WAIT;
    } else { G.bad = 0; G.good = 0; }
  }
  update(dt) {
    const calm = this.reduced(), speed = this.api.session.clock.speed, env = this.env;
    // camera tween, and a mouse notch's zoom ease
    this.zin.tick(dt);
    if (this.camTo) { const c = this.camTo, k = clamp((this.t - c.t0) / c.dur, 0, 1), e = ease(k); this.cam.x = lerp(c.from.x, c.x, e); this.cam.y = lerp(c.from.y, c.y, e); this.cam.z = lerp(c.from.z, c.z, e); if (k >= 1) this.camTo = null; this.clampCam(); }
    // light: rate-limited so fast clocks never strobe (WCAG 2.3.1); the golden hour follows the same limit
    const T = dayTargets(env.hour, speed, calm, this.tod), step = dt * 0.35;
    this.night += clamp(T.night - this.night, -step, step); this.dusk += clamp(T.dusk - this.dusk, -step, step);
    this.vt = calm ? 0 : this.t;
    env.t = this.vt; env.night = this.night; env.wind = calm ? 0 : 1; env.dim = 0;
    // entities walk (a buyer or the player who is moving kicks up a little dust; a crate or a building that lands raises a puff)
    const sp = 2.4, dust = !calm && !this.far && !!this.view;
    for (const [id, e] of this.ents) {
      if (e.type === 'lead') {
        const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
        e.moving = d > 0.06;
        if (e.moving) { const stp = Math.min(d, (calm ? 40 : sp) * dt); e.x += dx / d * stp; e.y += dy / d * stp; if (Math.abs(dx) > 0.01) e.dir = dx > 0 ? 1 : -1; if (dust) this.footstep(e, dt); }
        if (e.leaving && (calm || this.t >= leaveEnd(e.born, e.leaveAt))) this.ents.delete(id); // (a buyer goes when it has faded to nothing, wherever it has got to; under reduced motion it goes at once)
      } else if (e.gone && this.t - e.goneAt > 600) this.ents.delete(id);
      if (e.drop) { e.drop = Math.max(0, e.drop - (calm ? 999 : 180) * dt); if (!e.drop && dust) this.landed(e); }
    }
    // player walks
    const pl = this.player;
    if (pl.path.length) { const [tx, ty] = pl.path[0], dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy), v = pl.path.length > 1 ? pl.speed : Math.min(pl.speed, 5); if (d < 0.1) pl.path.shift(); else { const st = Math.min(d, (calm ? 4000 : v) * dt); pl.x += dx / d * st; pl.y += dy / d * st; if (Math.abs(dx) > 0.01) pl.dir = dx > 0 ? 1 : -1; } pl.moving = true; if (dust) this.footstep(pl, dt); } else pl.moving = false;
    // particles and weather (the pool is fixed: nothing is allocated here)
    this.fx.update(dt, calm);
    this.rainOn = !!(env.crunch && !calm);
    if (this.rainOn) this.fx.rainStep(dt);
  }
  /** A footstep puff behind something that walks, every quarter of a second while it is in view. */
  footstep(e, dt) {
    e.stepT = (e.stepT ?? 0) - dt; if (e.stepT > 0) return; e.stepT = 0.26;
    if (!this.onView(e.x, e.y, 30)) return;
    const [x, y] = P(e.x, e.y, zAt(e.x, e.y)); this.fx.puff(x - (e.dir || 1) * 4, y - 1, 4);
  }
  /** A crate or a building has just finished falling into place: dust and a small ring on the ground. */
  landed(e) {
    let gx, gy, z;
    if (e.type === 'lot' || e.type === 'asset') { [gx, gy] = this.posOf(e); z = zAt(gx, gy); } else if (e.type === 'pipe') { const pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length]; gx = pl[0] + 1.5; gy = pl[1] + 1.5; z = DIST[e.zone].z; } else return;
    if (!this.onView(gx, gy, 60)) return;
    const [x, y] = P(gx, gy, z), big = e.type === 'pipe'; for (let k = 0; k < (big ? 5 : 3); k++) this.fx.puff(x + (k - 1) * (big ? 14 : 8), y, big ? 9 : 6);
    this.fx.ring(x, y, 4, big ? 54 : 26, 0.6);
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const ctx = this.ctx, { W, H } = this, cam = this.cam, map = this.mode === 'map';
    this.hits.length = 0; this.overlay.length = 0; this.lights.length = 0; this.env.lights = this.lights;
    this.far = cam.z < FAR_ZOOM; this.env.far = this.far; this.env.lite = this.lite; this.env.tier = this.slow; this.env.lod = lodOf(cam.z, this.lod); this.env.farMix = farMix(cam.z, FAR_ZOOM); // (farMix: the far blocks fade into the full props over the zoom either side of FAR_ZOOM: no pop)
    const view = this.view || (this.view = { x0: 0, x1: 0, y0: 0, y1: 0 });
    view.x0 = cam.x - W / 2 / cam.z - 80; view.x1 = cam.x + W / 2 / cam.z + 80; view.y0 = cam.y - H / 2 / cam.z - 260; view.y1 = cam.y + H / 2 / cam.z + 80;
    runLayer('sea', this, ctx, view); this.toWorld(ctx);
    this.groundPass(ctx, view);
    // what stands on the ground: scenery, entities, the player and the traffic, depth-sorted back to front. The list and its records are reused every frame.
    const vz = this.vz; vz.clear(); this.itemN = 0;
    const seeBox = (b) => b[2] > view.x0 && b[0] < view.x1 && b[3] > view.y0 && b[1] < view.y1;
    for (const id of LAYOUT.ids) {
      const D = DIST[id]; if (!seeBox(D.bb)) continue; vz.add(id);
      for (const p of D.props) { if (p.sm && (this.env.farMix <= 0.001 || this.lite && cam.z < 0.6)) continue; if (p.bb[2] > view.x0 && p.bb[0] < view.x1 && p.bb[3] > view.y0 && p.bb[1] < view.y1) this.push(p.key, 's', p); }
    }
    for (const e of this.ents.values()) {
      if (e.type === 'truck') { const [gx, gy] = this.truckPos(e), x = sx(gx, gy), y = sy(gx, gy, zAt(gx, gy)); if (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1 + 60) this.push(gx + gy + 0.8, 'e', e); }
      else if (!vz.has(e.zone)) continue;
      else if (e.type === 'plot' || e.type === 'pipe') this.push(this.keyOf(e), 'e', e);
      else { const [gx, gy] = this.posOf(e); if (this.onView(gx, gy, 80)) this.push(gx + gy + 0.5, 'e', e); }
    }
    if (this.onView(this.player.x, this.player.y, 80)) this.push(this.player.x + this.player.y + 0.5, 'p', null);
    if (!this.reduced()) for (const c of this.cars()) if (this.onView(c.gx, c.gy, 40)) this.push(c.key, 'c', c);
    const items = this.items; items.length = this.itemN; items.sort(BY_KEY);
    for (let n = 0; n < items.length; n++) {
      const it = items[n];
      try {
        if (it.k === 's') runLayer('static', this, ctx, view, it.a);
        else if (it.k === 'e') this.drawEnt(ctx, it.a);
        else if (it.k === 'p') runLayer('player', this, ctx, view);
        else runLayer('car', this, ctx, view, it.a);
      } catch (err) { ctx.restore?.(); ctx.globalAlpha = 1; this.fault(err, it.k + ':' + (it.a?.t || it.a?.type || it.a?.i)); }
    }
    if (!map && this.cam.z < 0.4) for (const id of vz) { const D = DIST[id], open = this.unlocked?.has(id) ?? true; this.hits.push({ kind: 'zone', id, eid: 'tag:' + id, zone: id, label: open ? `Travel to ${D.name}` : `${D.name} (locked: opens at ${money(D.gate)} net worth)`, locked: !open, quick: true, gate: D.gate, circle: [sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 70, 44 / this.cam.z] }); }
    try { runLayer('clouds', this, ctx, view, vz); } catch (err) { ctx.restore?.(); this.fault(err, 'fog'); }
    if (this.hover) { const k = this.hover.kind + ':' + this.hover.id, fresh = this.hits.find((h) => h.kind + ':' + h.id === k); if (fresh) this.hover = fresh; this.drawHover(ctx); }
    // screen-space passes, back to front: the grade (tint, light pools, atmosphere), the map's routes, weather, floating dust, the labels, then particles
    this.toScreen(ctx);
    this.safeLayer('grade', 'drawGrade', ctx); if (map) this.safe('drawMapRoute', ctx); this.safeLayer('weather', 'drawWeather', ctx); this.safeLayer('field', 'drawField', ctx); this.safe('drawOverlay', ctx); this.safeLayer('particles', 'drawParticles', ctx);
    if (map) this.safe('drawMapLabels', ctx); this.safe('drawMini', ctx);
  }
  /** Run one screen-space pass; a pass that throws is logged once and never blanks the frame. */
  safe(name, ctx) { try { this[name](ctx); } catch (err) { ctx.restore?.(); this.fault(err, name); } }
  /** Run one layer of the stack in a screen-space pass; a layer that throws is logged once (under the method's old name) and never blanks the frame. */
  safeLayer(id, name, ctx) { try { runLayer(id, this, ctx, this.view); } catch (err) { ctx.restore?.(); this.fault(err, name); } }
  /**
   * The camera transform: world pixels (a grid point's sx, sy) to device pixels. The one place it is written. The scale is the frame's render scale (dpr x zoom to 1e-5, `renderScale`) and the translation is rounded to
   * WHOLE device pixels (docs/RENDER_PLAN.md section 5): the ground chunks, the cached sprites and the live art share one raster phase, a pan moves them all by whole pixels together so no edge crawls against another, and
   * every cached blit lands 1:1. Hit testing (w2s, s2w) keeps the exact camera: the difference is at most half a device pixel.
   */
  toWorld(ctx) { const a = this.renderScale(), s = this.snap || (this.snap = [0, 0]); snapTranslation(this.W, this.H, this.dpr, this.cam.x, this.cam.y, a, s); ctx.setTransform(a, 0, 0, a, s[0], s[1]); }
  /** The screen transform: css pixels of the window to device pixels. */
  toScreen(ctx) { const dpr = this.dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  /** Add one thing to this frame's depth-sorted list (reusing the record). */
  push(key, k, a) { const n = this.itemN++; let it = this.itemPool[n]; if (!it) it = this.itemPool[n] = { key: 0, k: '', a: null }; it.key = key; it.k = k; it.a = a; this.items[n] = it; }
  onView(gx, gy, m = 60) { const x = sx(gx, gy), y = sy(gx, gy, zAt(gx, gy)), v = this.view; return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }
  /** One broken object must never blank the world: log it once and keep drawing the rest. */
  fault(err, where) { this.faults = this.faults || new Set(); const k = where + err.message; if (!this.faults.has(k)) { this.faults.add(k); console.error('world: could not draw', where, err); } }
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
    if (ENT_KINDS.has(e.type)) runLayer(e.type, this, ctx, this.view, e); // lead, lot, asset, pipe, plot, truck: each a layer of stack.js
    ctx.globalAlpha = 1;
    if (e.gone) { this.hits.length = nh; this.overlay.length = no; } // a fading object takes no clicks and keeps no label
  }
  /** The highlight under the pointer: a soft amber halo under a crisp white rule (two strokes of one path; no shadow blur, which is slow). Crates also get a ring on the ground. */
  drawHover(ctx) {
    const h = this.hover, z = this.cam.z; ctx.save(); ctx.lineJoin = 'round'; ctx.beginPath();
    if (h.circle) ctx.ellipse(h.circle[0], h.circle[1] + 14, 18, 8, 0, 0, 7);
    else if (h.kind === 'static' || h.kind === 'plot' || h.kind === 'zone') for (const poly of h.polys) { poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
    else if ((h.kind === 'lot' || h.kind === 'asset') && h.polys) { const q = h.polys[0]; ctx.ellipse((q[0][0] + q[1][0]) / 2, q[2][1] - 3, 21, 9.5, 0, 0, 7); }
    ctx.strokeStyle = 'rgba(255,211,110,.34)'; ctx.lineWidth = 6 / z; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, 2 / z); ctx.stroke();
    ctx.restore();
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

// The layers' legacy drawers live in their owners' modules and are mixed in here, unchanged: a method in a module is a method of the World (this is the world).
Object.assign(World.prototype, seaMethods, groundMethods, coastMethods, terrainMethods, roadMethods, decalMethods, groundCacheMethods, cloudMethods, atmosMethods, staticMethods, plotMethods, actorMethods, stockMethods, overlayMethods, mapMethods);


const footBox = (gx, gy, w, d, z, h) => [(gx - gy - d) * HW - 6, (gx + gy) * HH - z - h - 6, (gx + w - gy) * HW + 6, (gx + w + gy + d) * HH - z + 4];
const blockPoly = (D) => [P(D.ox, D.oy, D.z), P(D.ox + BW, D.oy, D.z), P(D.ox + BW, D.oy + BD, D.z), P(D.ox, D.oy + BD, D.z)];

function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
