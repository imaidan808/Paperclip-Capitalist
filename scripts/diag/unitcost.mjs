// UNIT COSTS: what the canvas operations the art tracks will use cost, in the budget method's own machine (docs/RENDER_PLAN.md section 6): software-raster headless Chrome (scripts/cdp.mjs),
// a page at device scale 2, a visible canvas of the size the world would have (density 1.5: 2160 x 1350, or density 2: 2880 x 1800), a one-pixel readback after every operation so the raster is counted.
//   PORT=8781 node server/static.mjs &
//   DIAG_BASE=http://localhost:8781 DIAG_CDP=9781 node scripts/diag/unitcost.mjs [density 1.5|2] [repeats 40]
// Prints one row per operation: milliseconds per operation and per megapixel of destination, the median of the repeats, and writes unitcost-<density>.json under DIAG_OUT. The rows are what the
// budget rows of the plan are built from (an operation's cost is its destination pixels times its per-megapixel figure, plus a small fixed part): re-run it on the machine you judge on.
import { launch, open } from '../cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const BASE = process.env.DIAG_BASE || 'http://localhost:8090', CDP = +(process.env.DIAG_CDP || 9333), OUT = process.env.DIAG_OUT || tmpdir() + '/render-diag';
mkdirSync(OUT, { recursive: true });
const density = +(process.argv[2] || 1.5), reps = +(process.argv[3] || 40);
const b = await launch(CDP);
try {
  const p = await open(b, `${BASE}/dev/world-harness.html`, { w: 1440, h: 900, dsf: 2 });
  const rows = await p.eval(`(async () => {
    const D = ${density}, N = ${reps}, W = Math.round(1440 * D), H = Math.round(900 * D), MP = W * H / 1e6;
    document.body.innerHTML = ''; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.style.cssText = 'width:1440px;height:900px;display:block'; document.body.append(cv);
    const g = cv.getContext('2d'), mk = (w, h) => new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const flush = () => g.getImageData(0, 0, 1, 1);
    // sources: a window-size opaque layer, a window-size layer of soft shapes with alpha (what a cloud bank is), a half-size one, a bitmap one texel per 10 world pixels at zoom 0.9 (13.5 device px at density 1.5)
    const fill = (c, w, h, f) => { const x = c.getContext('2d'); f(x, w, h); return c; };
    const opaque = fill(mk(W, H), W, H, (x) => { const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#6fb7ee'); gr.addColorStop(1, '#2358b0'); x.fillStyle = gr; x.fillRect(0, 0, W, H); });
    const shapes = (w, h) => (x) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(247,249,255,0.85)'; x.beginPath(); x.arc((i * 137) % w, (i * 71) % h, h / 9, 0, 7); x.fill(); } };
    const alphaFull = fill(mk(W, H), W, H, shapes(W, H)), alphaHalf = fill(mk(W / 2, H / 2), W / 2, H / 2, shapes(W / 2, H / 2));
    const tex = fill(mk(W / 13.5, H / 13.5), W / 13.5, H / 13.5, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#43c8d0'); gr.addColorStop(1, '#2b80cf'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
    const rad = fill(mk(512, 512), 512, 512, (x) => { const r = x.createRadialGradient(256, 256, 0, 256, 256, 256); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 512, 512); });
    const path = new Path2D(); for (let i = 0; i < 24; i++) { const y = 40 + i * (H / 25); path.moveTo(0, y); for (let x = 0; x <= W; x += 60) path.lineTo(x, y + Math.sin(x / 90 + i) * 14); }
    const ops = [
      ['clearRect, full window', MP, () => g.clearRect(0, 0, W, H)],
      ['fillRect opaque, full window', MP, () => { g.fillStyle = '#2358b0'; g.fillRect(0, 0, W, H); }],
      ['fillRect alpha 0.5, full window', MP, () => { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, 0, W, H); }],
      ['fillRect, linear gradient, full window', MP, () => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#6fb7ee'); gr.addColorStop(1, '#2358b0'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }],
      ['drawImage 1:1 opaque layer (the ground blit)', MP, () => g.drawImage(opaque, 0, 0)],
      ['drawImage 1:1 layer of soft shapes with alpha (a baked cloud bank, full window)', MP, () => g.drawImage(alphaFull, 0, 0)],
      ['drawImage half-size layer scaled x2, smoothing on (a half-density bank)', MP, () => { g.imageSmoothingEnabled = true; g.drawImage(alphaHalf, 0, 0, W, H); }],
      ['drawImage half-size layer scaled x2, alpha 0.85', MP, () => { g.globalAlpha = 0.85; g.drawImage(alphaHalf, 0, 0, W, H); g.globalAlpha = 1; }],
      ['drawImage depth bitmap (1 texel per 10 wpx) scaled x13.5, smoothing on (the sea)', MP, () => { g.imageSmoothingEnabled = true; g.drawImage(tex, 0, 0, W, H); }],
      ['drawImage the same, smoothing off', MP, () => { g.imageSmoothingEnabled = false; g.drawImage(tex, 0, 0, W, H); g.imageSmoothingEnabled = true; }],
      ['stroke 24 long wave-band paths, width 8 device px, alpha .45', MP, () => { g.strokeStyle = 'rgba(226,250,255,.45)'; g.lineWidth = 8; g.lineCap = 'round'; g.stroke(path); }],
      ['100 flat discs of radius 100 device px (3.1 Mpx of fill)', 3.14, () => { g.fillStyle = 'rgba(247,249,255,.85)'; for (let i = 0; i < 100; i++) { g.beginPath(); g.arc((i * 97) % W, (i * 61) % H, 100, 0, 7); g.fill(); } }],
      ['20 puffs (body, belly, top: three fills in a clip) of radius 230 device px (cloud puffs at zoom 1.2)', 20 * Math.PI * 230 * 230 * 3 / 1e6, () => { for (let i = 0; i < 20; i++) { const x = (i * 211) % W, y = (i * 173) % H, r = 230; g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#f7f9ff'; g.fill(); g.clip(); g.beginPath(); g.rect(x - 4 * r, y - 4 * r, 8 * r, 8 * r); g.arc(x - .28 * r, y - .3 * r, .98 * r, 0, 7); g.fillStyle = '#c3d1f2'; g.fill('evenodd'); g.restore(); } }],
      ['20 puff sprites (one drawImage each) of radius 230 device px', 20 * Math.PI * 230 * 230 / 1e6, () => { for (let i = 0; i < 20; i++) g.drawImage(rad, (i * 211) % W - 230, (i * 173) % H - 230, 460, 460); }],
      ['400 small glints (drawImage 12 x 12)', 400 * 144 / 1e6, () => { for (let i = 0; i < 400; i++) g.drawImage(rad, (i * 53) % W, (i * 29) % H, 12, 12); }],
      ['setTransform x 100', 0, () => { for (let i = 0; i < 100; i++) g.setTransform(D, 0, 0, D, i, i); g.setTransform(1, 0, 0, 1, 0, 0); }],
    ];
    const rowsOut = [];
    for (const [name, mp, f] of ops) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; for (let i = 0; i < 4; i++) { f(); flush(); }
      const t = []; for (let i = 0; i < N; i++) { const a = performance.now(); f(); flush(); t.push(performance.now() - a); } t.sort((x, y) => x - y);
      rowsOut.push({ name, mpx: +mp.toFixed(3), ms: +t[N >> 1].toFixed(2), p10: +t[N >> 3].toFixed(2), msPerMpx: mp ? +(t[N >> 1] / mp).toFixed(3) : null });
    }
    { const t = []; for (let i = 0; i < N; i++) { const a = performance.now(); flush(); t.push(performance.now() - a); } t.sort((x, y) => x - y); rowsOut.push({ name: 'the readback alone (subtract this)', mpx: 0, ms: +t[N >> 1].toFixed(2), p10: +t[N >> 3].toFixed(2), msPerMpx: null }); }
    return { density: D, canvas: [W, H], mpx: +MP.toFixed(3), rows: rowsOut };
  })()`);
  console.log(`density ${rows.density}, canvas ${rows.canvas.join(' x ')} (${rows.mpx} Mpx)`);
  console.table(rows.rows);
  writeFileSync(`${OUT}/unitcost-${density}.json`, JSON.stringify(rows, null, 1));
} finally { b.close(); }
process.exit(0);
