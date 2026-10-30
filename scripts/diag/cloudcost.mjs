// CLOUD COST: what a bank of cloud over a locked district costs to draw live, on the budget machine, against the model of js/world/cloudbank.js (docs/RENDER_PLAN.md section 6).
// The puffs are drawn as the plan says: back to front, each a flat disc (body) and two crescents (belly, top) filled as paths, never a clip and never a sprite scaled up (a scaled, smoothed blit is ten times the cost
// of a fill: scripts/diag/unitcost.mjs). Scenes: the plan's budget scenes (zoom and district) at the density 1.5 canvas of a CPU-drawn world and at density 2; each is the median of N draws with the one-pixel readback.
//   PORT=8781 node server/static.mjs &
//   DIAG_BASE=http://localhost:8781 DIAG_CDP=9781 node scripts/diag/cloudcost.mjs [repeats 30]
import { launch, open } from '../cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const BASE = process.env.DIAG_BASE || 'http://localhost:8090', CDP = +(process.env.DIAG_CDP || 9333), OUT = process.env.DIAG_OUT || tmpdir() + '/render-diag';
mkdirSync(OUT, { recursive: true });
const reps = +(process.argv[2] || 30);
const b = await launch(CDP);
try {
  const p = await open(b, `${BASE}/dev/world-harness.html`, { w: 1440, h: 900, dsf: 2 });
  const res = await p.eval(`(async () => {
    const N = ${reps}, B = await import('/js/world/cloudbank.js'), L = await import('/js/world/layout.js'), I = await import('/js/world/iso.js'), PAL = await import('/js/world/palette.js');
    document.body.innerHTML = ''; const cv = document.createElement('canvas'); document.body.append(cv); const g = cv.getContext('2d', { alpha: false });
    const C = PAL.CLOUD, ROWA = [0.90, 0.82, 0.78];
    const crescent = (x, y, r, ox, oy, rb, fill) => { const d = Math.hypot(ox, oy), a = Math.atan2(oy, ox), al = Math.acos(Math.max(-1, Math.min(1, (d * d + r * r - rb * rb) / (2 * d * r)))), be = Math.acos(Math.max(-1, Math.min(1, (d * d + rb * rb - r * r) / (2 * d * rb))));
      g.beginPath(); g.arc(x, y, r, a + al, a + 2 * Math.PI - al); g.arc(x + ox, y + oy, rb, a + Math.PI + be, a + Math.PI - be, true); g.closePath(); g.fillStyle = fill; g.fill(); };
    const puff = (q) => { const { x, y, r } = q; g.globalAlpha = ROWA[q.row]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = C.body; g.fill(); crescent(x, y, r, -0.28 * r, -0.30 * r, 0.98 * r, C.belly); crescent(x, y, r, 0.22 * r, 0.26 * r, 0.95 * r, C.top); };
    const scenes = [
      ['0.9 district 1 (coast, working)', 1, 0.9], ['1.0 district 1', 1, 1.0], ['1.2 district 3 (locked, working)', 3, 1.2], ['1.2 district 11 (the largest)', 11, 1.2], ['2.4 district 1 (finest)', 1, 2.4], ['0.5 district 3', 3, 0.5], ['0.3 district 3', 3, 0.3],
    ];
    // the middle zooms: every locked bank in view at once, the coarse bank, puffs drawn per puff (3 fills each) or batched per tier (the body discs of a tier in ONE path, its belly crescents in one, its tops in one)
    const crescentPath = (x, y, r, ox, oy, rb) => { const d = Math.hypot(ox, oy), a = Math.atan2(oy, ox), al = Math.acos(Math.max(-1, Math.min(1, (d * d + r * r - rb * rb) / (2 * d * r)))), be = Math.acos(Math.max(-1, Math.min(1, (d * d + rb * rb - r * r) / (2 * d * rb)))); g.moveTo(x + r * Math.cos(a + al), y + r * Math.sin(a + al)); g.arc(x, y, r, a + al, a + 2 * Math.PI - al); g.arc(x + ox, y + oy, rb, a + Math.PI + be, a + Math.PI - be, true); g.closePath(); };
    const batched = (list, view) => { for (let row = 0; row < 3; row++) { const mine = list.filter((q) => q.row === row && !(q.x + q.r < view.x0 || q.x - q.r > view.x1 || q.y + q.r < view.y0 || q.y - q.r > view.y1)); if (!mine.length) continue;
        g.globalAlpha = ROWA[row]; g.beginPath(); for (const q of mine) { g.moveTo(q.x + q.r, q.y); g.arc(q.x, q.y, q.r, 0, 7); } g.fillStyle = C.body; g.fill();
        g.globalAlpha = ROWA[row]; g.beginPath(); for (const q of mine) crescentPath(q.x, q.y, q.r, -0.28 * q.r, -0.30 * q.r, 0.98 * q.r); g.fillStyle = C.belly; g.fill();
        g.beginPath(); for (const q of mine) crescentPath(q.x, q.y, q.r, 0.22 * q.r, 0.26 * q.r, 0.95 * q.r); g.fillStyle = C.top; g.fill(); } };
    const zc = (id) => { const d = L.DIST[id]; return [I.sx(d.cx, d.cy), I.sy(d.cx, d.cy, d.z) - 20]; };
    const island = [['0.3 every locked bank in view', 710.66, 2467.44, 0.3], ['0.5 every locked bank in view', 710.66, 2467.44, 0.5], ['0.9 every locked bank in view (d3)', ...zc(3), 0.9]];
    const out = [];
    for (const D of [1.5]) {
      const W = Math.round(1440 * D), H = Math.round(900 * D); cv.width = W; cv.height = H; cv.style.cssText = 'width:1440px;height:900px;display:block';
      for (const [name, x, y, z] of island) for (const mode of ['per puff', 'batched per tier']) {
        const view = { x0: x - 720 / z, x1: x + 720 / z, y0: y - 450 / z, y1: y + 450 / z }, sc = B.bankScale(z) || 1.6, all = []; let model = 0, n = 0;
        for (const id of Object.keys(L.DIST)) { if (+id === 1) continue; const d = L.DIST[id], pf = B.bankPuffs(d.fp, d.z, sc); all.push(...pf); model += B.bankMs(pf, z, D, view); n += B.inView(pf, view); }
        const t = [];
        for (let i = 0; i < N + 3; i++) {
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#2fa6d6'; g.fillRect(0, 0, W, H);
          const a = performance.now(); g.setTransform(D * z, 0, 0, D * z, D * (720 - x * z), D * (450 - y * z));
          if (mode === 'per puff') { for (const q of all) { if (q.x + q.r < view.x0 || q.x - q.r > view.x1 || q.y + q.r < view.y0 || q.y - q.r > view.y1) continue; puff(q); } } else batched(all, view);
          g.globalAlpha = 1; g.getImageData(0, 0, 1, 1); if (i >= 3) t.push(performance.now() - a);
        }
        t.sort((p, q) => p - q); out.push({ density: D, scene: name + ', ' + mode, puffs: all.length, inView: n, model: mode === 'per puff' ? +model.toFixed(2) : null, ms: +t[N >> 1].toFixed(2), p10: +t[N >> 3].toFixed(2) });
      }
    }
    for (const D of [1.5, 2]) {
      const W = Math.round(1440 * D), H = Math.round(900 * D); cv.width = W; cv.height = H; cv.style.cssText = 'width:1440px;height:900px;display:block';
      for (const [name, id, z] of scenes) {
        const d = L.DIST[id], puffs = B.bankPuffs(d.fp, d.z), cx = I.sx(d.cx, d.cy), cy = I.sy(d.cx, d.cy, d.z);
        const view = { x0: cx - 720 / z, x1: cx + 720 / z, y0: cy - 450 / z, y1: cy + 450 / z }, mpx = B.fillMpx(puffs, z, D, view, 'flat'), clip = B.fillMpx(puffs, z, D, view, 'clip');
        const t = [];
        for (let i = 0; i < N + 3; i++) {
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#2fa6d6'; g.fillRect(0, 0, W, H);
          const a = performance.now();
          g.setTransform(D * z, 0, 0, D * z, D * (720 - cx * z), D * (450 - cy * z));
          for (const q of puffs) { if (q.x + q.r < view.x0 || q.x - q.r > view.x1 || q.y + q.r < view.y0 || q.y - q.r > view.y1) continue; puff(q); }
          g.globalAlpha = 1; g.getImageData(0, 0, 1, 1); if (i >= 3) t.push(performance.now() - a);
        }
        t.sort((x, y) => x - y);
        out.push({ density: D, scene: name, puffs: puffs.length, cover: +B.coverage(puffs, d.fp, d.z).toFixed(3), inView: B.inView(puffs, view), mpxFlat: +mpx.toFixed(2), mpxClip: +clip.toFixed(2), model: +B.bankMs(puffs, z, D, view).toFixed(2), ms: +t[N >> 1].toFixed(2), p10: +t[N >> 3].toFixed(2), });
      }
    }
    return out;
  })()`);
  console.table(res);
  writeFileSync(`${OUT}/cloudcost.json`, JSON.stringify(res, null, 1));
} finally { b.close(); }
process.exit(0);
