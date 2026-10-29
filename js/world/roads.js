// Roads between districts (ribbons that follow the ground), footpaths, the ferry's route, bridges and the crosswalks at every block. LEGACY drawers.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { P, HW, HH, quad, ellipse } from './iso.js';
import { LAYOUT, DIST, EDGES, zAt } from './layout.js';

export const roadMethods = {
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
  },

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
  },

  /** Crosswalks at the junction of every block (flat white bars). */
  drawMarks(ctx, D, z) {
    const { ox, oy } = D, w = 'rgba(255,255,255,.5)';
    for (let k = 0; k < 5; k++) {
      const u = 0.15 + k * 0.17;
      for (const x of [ox + 8.4, ox + 13.1]) quad(ctx, [P(x, oy + 8 + u * 2 - 0.1, z), P(x + 0.5, oy + 8 + u * 2 - 0.1, z), P(x + 0.5, oy + 8 + u * 2 + 0.05, z), P(x, oy + 8 + u * 2 + 0.05, z)], w);
      for (const y of [oy + 6.5, oy + 11.1]) quad(ctx, [P(ox + 10 + u * 2 - 0.1, y, z), P(ox + 10 + u * 2 + 0.05, y, z), P(ox + 10 + u * 2 + 0.05, y + 0.5, z), P(ox + 10 + u * 2 - 0.1, y + 0.5, z)], w);
    }
  },
};
