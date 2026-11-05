// What this machine does with the world, in one line you can paste back: `pc.perf()` in the browser's console (or `pc.perf(40)` for forty seconds) while the game is on a lit district view and you move around as you
// do when it lags. It records the world's own frames (what each draw cost in JavaScript, which quality tier the governor held, the frame rate it asked for, whether the ground was whole), the page's frame
// intervals, the long frames the browser reports, and a small fill-rate test of a scratch canvas of the world's size (a canvas the GPU holds fills many times faster than one the CPU holds), and answers with one JSON line.
// Why it exists: a replay of the night recording on a development Mac did not reproduce the 18 to 27 frames a second of the author's lit views (docs/ARCHITECTURE.md, "The world"), and a replay cannot tell the three causes
// apart: a machine that is slow (tier 0, draws of 20 ms and more), a governor that settled on a low tier (tier 3 to 6 and draws of 3 to 8 ms: 20 and 15 frames a second are the tier's cap, not the machine's), and a canvas
// that is drawn on the CPU (a low fill rate, `softwareRaster`). Read-only: it wraps the world's `draw` for its seconds and puts it back, and changes nothing the player sees. Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5).
import { ledger, softwareRaster } from './gfx.js';

const q = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const r1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const EDGES = [18, 34, 51, 68, 100]; // the buckets of the gap histogram of the recording of 2026-11-04 (963, 284, 297, 128, 71, none over 100 ms): milliseconds
const hist = (a) => { const h = EDGES.map(() => 0).concat(0); for (const x of a) { let i = 0; while (i < EDGES.length && x > EDGES[i]) i++; h[i]++; } return h; };
const gpuName = () => { try { const c = document.createElement('canvas'), gl = c.getContext('webgl'); if (!gl) return 'no webgl'; const e = gl.getExtension('WEBGL_debug_renderer_info'), r = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'hidden'; gl.getExtension('WEBGL_lose_context')?.loseContext(); return String(r).slice(0, 80); } catch { return '?'; } };
/**
 * Millions of pixels a second a scratch canvas of the world's own size fills (8 half-transparent fills of the whole canvas, then one pixel read back so the work is finished), after a small canvas has woken the
 * browser's canvas machinery: 10,000 to 12,000 on a GPU canvas and 2,800 to 3,900 on one the CPU draws, on a development MacBook Pro (headless Chrome, GPU on and off): read it against the same fill on the machine it is asked on. Made at the size of the world's canvas, so it is what the
 * browser would decide for the world's canvas today (a browser keeps canvases on the CPU past some budget of GPU memory, or when its GPU is blocklisted for 2D canvases, which a WebGL probe does not see).
 * It takes 5 to 60 ms, and the probe runs it after its recording, not in it. Null where there is no OffscreenCanvas.
 */
export function fillRate(width = 3024, height = 1730) {
  const run = (w, h, n) => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#7ac'; const t = performance.now(); for (let i = 0; i < n; i++) { g.globalAlpha = 0.5; g.fillRect(0, 0, w, h); } g.getImageData(0, 0, 1, 1); return performance.now() - t; };
  try { run(64, 64, 1); return Math.round((8 * width * height) / 1e3 / Math.max(0.01, run(width, height, 8))); } catch { return null; } // (a canvas of its own for each: a browser that sees one read back twice moves it to the CPU for good)
}

/** Record `seconds` (1 to 120, 25 by default) of the world `w` and answer the report. The wrappers are put back at the end. */
export function perfProbe(w, seconds = 25) {
  const S = Math.max(1, Math.min(120, +seconds || 25)), od = w.draw, ownD = Object.prototype.hasOwnProperty.call(w, 'draw');
  const D = { t: [], cost: [], tier: [], fps: [], mv: [], bare: [], sm: [], lag: [] }, raf = [], tierAt = [[0, w.slow | 0]], notes = [], loaf = []; let on = true, lastTier = w.slow | 0, dpr0 = w.dpr;
  const env = { ua: navigator.userAgent, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory || null, dsf: window.devicePixelRatio, win: [innerWidth, innerHeight], screen: [screen.width, screen.height], canvas: [w.cv.width, w.cv.height], dpr: w.dpr, zoom: +w.cam.z.toFixed(3), softwareRaster: softwareRaster(), gpu: gpuName(), reduced: !!(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), focus: document.hasFocus(), visible: document.visibilityState };
  const t0 = performance.now();
  w.draw = function () {
    const t = performance.now(); od.call(this); if (!on) return;
    D.t.push(t - t0); D.lag.push(t - this.last); D.cost.push(performance.now() - t); D.tier.push(this.slow | 0); D.fps.push(this.fps); D.mv.push(this.moving ? 1 : 0); D.bare.push(!this.gcValid || this.gcMore || this.gcHoles > 0 ? 1 : 0); D.sm.push(this.gov ? this.gov.cost : 0);
    if ((this.slow | 0) !== lastTier) { lastTier = this.slow | 0; tierAt.push([+((t - t0) / 1000).toFixed(1), lastTier]); }
  };
  const f = (ts) => { if (on) { raf.push(ts - t0); requestAnimationFrame(f); } }; requestAnimationFrame(f);
  let po = null; try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) loaf.push(Math.round(e.duration)); }); po.observe({ type: 'long-animation-frame', buffered: false }); } catch { try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) loaf.push(Math.round(e.duration)); }); po.observe({ type: 'longtask', buffered: false }); notes.push('longtask'); } catch { po = null; notes.push('no long-frame entries'); } }
  let bat = null; try { navigator.getBattery().then((b) => { bat = { charging: b.charging, level: b.level }; }).catch(() => {}); } catch { /* no battery api */ }
  return new Promise((resolve) => setTimeout(() => {
    on = false; if (ownD) w.draw = od; else delete w.draw; try { po && po.disconnect(); } catch { /* gone */ }
    const gaps = []; for (let i = 1; i < D.t.length; i++) gaps.push(D.t[i] - D.t[i - 1]);
    const rd = []; for (let i = 1; i < raf.length; i++) rd.push(raf[i] - raf[i - 1]);
    const share = (a, f) => (a.length ? Math.round((100 * a.filter(f).length) / a.length) : null), tiers = [0, 1, 2, 3, 4, 5, 6].map((k) => share(D.tier, (x) => x === k));
    const by = (mv) => { const ix = D.t.map((_, i) => i).filter((i) => D.mv[i] === mv), c = ix.map((i) => D.cost[i]); return { draws: ix.length, costP50: r1(q(c, 0.5)), costP95: r1(q(c, 0.95)), costMax: r1(Math.max(0, ...c)) }; };
    const rep = {
      probe: 'pc.perf v1', seconds: S, env: { ...env, fillMpxPerSec: fillRate(w.cv.width, w.cv.height), battery: bat, dprNow: w.dpr, dprAtStart: dpr0, ledgerMB: +(ledger.total() / 1e6).toFixed(1), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) : null },
      draws: { n: D.t.length, perSec: r1(D.t.length / S), moving: by(1), still: by(0), startLagP50: r1(q(D.lag.filter(Number.isFinite), 0.5)), startLagP95: r1(q(D.lag.filter(Number.isFinite), 0.95)), gapP50: r1(q(gaps, 0.5)), gapP95: r1(q(gaps, 0.95)), gapMax: r1(Math.max(0, ...gaps)), gapHist: hist(gaps), fpsAsked: [...new Set(D.fps)].sort((a, b) => a - b), smoothedCostP50: r1(q(D.sm, 0.5)), smoothedCostMax: r1(Math.max(0, ...D.sm)) },
      tiers: { sharePercent: tiers, changes: tierAt.slice(0, 40), max: Math.max(0, ...D.tier) },
      raf: { perSec: r1(raf.length / S), p50: r1(q(rd, 0.5)), p95: r1(q(rd, 0.95)), max: r1(Math.max(0, ...rd)), hist: hist(rd) },
      ground: { drawsWithBareGroundPercent: share(D.bare, (x) => x === 1), chunks: w.gc && w.gc.size, overviewChunks: w.gc && w.gc.ov && w.gc.ov.size, workers: w.gcWorker ? { live: w.gcWorker.live, ...w.gcWorker.stats, pending: w.gcWorker.pending } : (w.gcWorker === null ? 'given up: the main thread makes the chunks' : 'none asked yet') },
      longFrames: { n: loaf.length, max: Math.max(0, ...loaf), over100: loaf.filter((x) => x > 100).length }, notes,
    };
    try { console.log('pc.perf ' + JSON.stringify(rep)); } catch { /* no console */ }
    resolve(rep);
  }, S * 1000));
}
