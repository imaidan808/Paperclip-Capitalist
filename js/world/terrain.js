// The terrain: land tiles as flat diamonds in the colour layout.js gave each, at a coarser stride when zoomed out. LEGACY drawer (the lit colour field replaces it).
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { HW, HH, toGrid, fogged } from './iso.js';
import { LAYOUT, GW, GH } from './layout.js';
import { FOG_DIM } from './common.js';

export const terrainMethods = {
  /** The terrain: the tiles in view (a coarser mesh when zoomed out), tinted down where a district is still locked. */
  drawTerrain(ctx, view, zoom) {
    const { ZV, VW, tcol, land, lands, owner, core, maxZ } = LAYOUT, stride = zoom >= 0.85 ? 1 : zoom >= 0.5 ? 2 : zoom >= 0.28 ? 4 : 8;
    // terrain: the tiles in view (a coarser mesh when zoomed out), tinted down where a district is still locked
    let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) for (const zz of [0, maxZ]) { const [a, b] = toGrid(x, y, zz); gx0 = Math.min(gx0, a); gx1 = Math.max(gx1, a); gy0 = Math.min(gy0, b); gy1 = Math.max(gy1, b); }
    const i0 = Math.max(0, Math.floor(gx0) - 1), i1 = Math.min(GW - 1, Math.ceil(gx1) + 1), j0 = Math.max(0, Math.floor(gy0) - 1), j1 = Math.min(GH - 1, Math.ceil(gy1) + 1);
    const sig = this.unlocked ? [...this.unlocked].join() : ''; if (sig !== this.tileSig) { this.tileSig = sig; this.dimTiles = new Map(); }
    const st = stride, Ls = st > 1 ? lands[st] : null, Z = (i, j) => ZV[Math.min(j, GH) * VW + Math.min(i, GW)];
    ctx.lineWidth = 0.8;
    for (let j = j0 - (j0 % st); j <= j1; j += st) for (let i = i0 - (i0 % st); i <= i1; i += st) {
      const px = (i - j) * HW; if (px < view.x0 - 90 * st || px > view.x1 + 90 * st) continue;
      let col;
      if (st === 1) { const k = j * GW + i; if (!land[k] || core[k]) continue; col = tcol[k]; const o = owner[k]; if (o && this.unlocked) { const dm = this.fxOf(o).dim; if (dm) { if (dm === FOG_DIM) { col = this.dimTiles.get(k) || (this.dimTiles.set(k, fogged(col, dm)), this.dimTiles.get(k)); } else col = fogged(col, dm); } } }
      else { if (!Ls.a[Math.floor(j / st) * Ls.w + Math.floor(i / st)]) continue; col = this.coarseCol(st, i, j); }
      // the tile's four corners worked out in place (no arrays: this loop runs thousands of times a frame when the camera moves)
      ctx.beginPath(); ctx.moveTo((i - j) * HW, (i + j) * HH - Z(i, j)); ctx.lineTo((i + st - j) * HW, (i + st + j) * HH - Z(i + st, j)); ctx.lineTo((i - j) * HW, (i + j + 2 * st) * HH - Z(i + st, j + st)); ctx.lineTo((i - j - st) * HW, (i + j + st) * HH - Z(i, j + st)); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.stroke();
    }
  },

  /** The colour of a coarse terrain cell: the first land tile in it nearest its middle. */
  coarseCol(st, i, j) {
    const key = st * 1e7 + j * 1000 + i; this.cc = this.cc || new Map(); let c = this.cc.get(key);
    if (c === undefined) { c = '#4b7a4e'; let best = 1e9; for (let b = 0; b < st; b++) for (let a = 0; a < st; a++) { const k = (j + b) * GW + i + a; if (i + a < GW && j + b < GH && LAYOUT.land[k]) { const d = Math.abs(a - st / 2) + Math.abs(b - st / 2); if (d < best) { best = d; c = LAYOUT.tcol[k]; } } } this.cc.set(key, c); }
    return c;
  },
};
