// Ground decals a district lays down (lawns, cobbles, bays, circuit traces, crops, water) and the moving ones drawn live over the cached ground. LEGACY drawers.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { P, HW, HH, quad, ellipse, fogged, h2 } from './iso.js';
import { LAYOUT, DIST } from './layout.js';

export const decalMethods = {
  /** Ground decals a theme lays down: lawns, cobbles, bays, circuit traces, crops, water. */
  drawDecal(ctx, d, z, k, part = 0) { // part 0: all of it; 1: what stands still; 2: what moves (water waves, pulses)
    if (part === 1 && d.k === 'pulse') return;
    const col = (c) => (c && k && c[0] === '#' ? fogged(c, k) : c), { x, y, w, d: dd } = d;
    const rect = (x0, y0, w0, d0, fill, stroke) => quad(ctx, [P(x0, y0, z), P(x0 + w0, y0, z), P(x0 + w0, y0 + d0, z), P(x0, y0 + d0, z)], col(fill), stroke ? col(stroke) : null);
    switch (d.k) {
      case 'rect': rect(x, y, w, dd, d.fill, d.stroke); break;
      case 'ell': { const [px, py] = P(x, y, z); ellipse(ctx, px, py, d.r * HW * 1.42, d.r * HH * 1.42, col(d.fill), d.stroke ? col(d.stroke) : null, 1.5); break; }
      case 'stripes': { const n = d.n; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; if (d.axis === 'x') rect(x, y + dd * t0, w, dd * (t1 - t0) + 0.01, i % 2 ? d.c2 : d.c1); else rect(x + w * t0, y, w * (t1 - t0) + 0.01, dd, i % 2 ? d.c2 : d.c1); } break; }
      case 'checker': { rect(x, y, w, dd, d.c1); const s = d.step; for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if ((i + j) % 2) rect(x + i * s, y + j * s, Math.min(s, w - i * s), Math.min(s, dd - j * s), d.c2); break; }
      case 'grid': { ctx.strokeStyle = d.col; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= w + 0.01; i += d.step) { const a = P(x + i, y, z), b = P(x + i, y + dd, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } for (let j = 0; j <= dd + 0.01; j += d.step) { const a = P(x, y + j, z), b = P(x + w, y + j, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); break; }
      case 'spk': { ctx.fillStyle = d.fill; for (let i = 0; i < d.n; i++) { const [px, py] = P(x + h2(d.seed, i * 2) * w, y + h2(d.seed, i * 2 + 1) * dd, z); ctx.fillRect(px, py, d.r, d.r); } break; }
      case 'pulse': { if (part === 1) break; const ph = this.vt ? this.vt / 900 : 0; ctx.fillStyle = d.col; for (let i = 0; i < 7; i++) { const [px, py] = P(x + h2(7, i) * w, y + h2(8, i) * dd, z); ctx.globalAlpha = 0.35 + 0.35 * Math.sin(ph + i * 1.7); ctx.fillRect(px - 2, py - 1, 4, 2); } ctx.globalAlpha = 1; break; }
      case 'water': {
        if (part !== 2) rect(x, y, w, dd, d.fill);
        if (part === 1) break;
        const ph = this.vt ? this.vt / 700 : 0;
        ctx.strokeStyle = 'rgba(200,235,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 1; i < 7; i++) { const yy = y + (dd * i) / 7; for (let j = 0; j <= 12; j++) { const xx = x + (w * j) / 12, [px, py] = P(xx, yy + Math.sin(ph + j * 0.8 + i) * 0.06, z); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } }
        ctx.stroke(); break;
      }
      default: break;
    }
  },

  /** The moving decals (water, pulses) of the districts in view, drawn over the cached ground. Which decals move is worked out once per district. */
  drawLiveDecals(ctx, view) {
    const zoom = this.cam.z;
    for (const id of LAYOUT.ids) {
      const D = DIST[id], b = D.bb; if (!(b[2] > view.x0 && b[0] < view.x1 && b[3] + 200 > view.y0 && b[1] + 200 < view.y1)) continue;
      let live = this.decals.get(id); if (!live) this.decals.set(id, (live = D.decals.filter((d) => d.k === 'water' || d.k === 'pulse')));
      for (const d of live) if (zoom >= (d.min ?? 0.3)) this.drawDecal(ctx, d, D.z, this.fxOf(id).dim, 2);
    }
  },
};
