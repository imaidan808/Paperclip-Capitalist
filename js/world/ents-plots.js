// Empty building plots and the pipelines built on them (a building per pipeline, its height the level). LEGACY drawers.
// Owner: T3 BUILDINGS (docs/RENDER_PLAN.md).
import { PIPE } from '../config.js';
import { P, box, quad, shadow, cyl, tone, shade, clamp, diamond, facePoint, windows } from './iso.js';
import { DIST, PLOTS } from './layout.js';
import { PIP_ZOOM } from './common.js';
import './plots.js'; // the V2 drawers of the 'plot' and 'pipe' layers (registerLayer): used while those flags are v2

export const plotMethods = {
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
    if (this.cam.z > 0.5) this.overlay.push({ k: 'chip', n: 6, wx: x, wy: y - 20, draw: (g, px, py, s) => this.chip(g, px, py, e.locked ? 'Locked' : '+ Hire', e.locked ? '#a3b3c9' : '#ffd36e', s) });
  },

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
    if (this.cam.z >= PIP_ZOOM) this.overlay.push({ k: 'bar', n: 0, wx: x, wy: y - h - 14 - e.drop, draw: (g, px, py, s) => this.progress(g, px, py, s, frac, p, off) });
  },
};
