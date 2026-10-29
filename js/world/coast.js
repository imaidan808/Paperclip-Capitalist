// The coast: cliff walls and the foam line at their foot. LEGACY drawer, the tile-edge coast (a smooth shaped coast with beach, foam and strata replaces it).
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { P, sx, sy, quad, shade, mix, clamp } from './iso.js';
import { LAYOUT, SEA } from './layout.js';

export const coastMethods = {
  /** Cliff walls, and where a wall meets the water a pale line of foam over a dark contact line (all cliffs in one path). */
  drawCliffs(ctx, view, far, see) {
    let foam = false;
    for (const c of LAYOUT.cliffs) {
      if (!see(c.bb[0], c.bb[1], c.bb[2], c.bb[3])) continue;
      if (!far) { // where the wall meets the water: a pale line of foam over a dark contact line, all cliffs in one path
        if (!foam) { foam = true; ctx.beginPath(); }
        if (c.k === 's') { ctx.moveTo(sx(c.x, c.y), sy(c.x, c.y, -SEA)); ctx.lineTo(sx(c.x + 1, c.y), sy(c.x + 1, c.y, -SEA)); } else { ctx.moveTo(sx(c.x, c.y), sy(c.x, c.y, -SEA)); ctx.lineTo(sx(c.x, c.y + 1), sy(c.x, c.y + 1, -SEA)); }
      }
      const col = mix('#9a8a64', '#575d6a', clamp((c.za + c.zb) / 90, 0, 1));
      if (c.k === 's') { quad(ctx, [P(c.x, c.y, c.za), P(c.x + 1, c.y, c.zb), P(c.x + 1, c.y, -SEA), P(c.x, c.y, -SEA)], col, col, 0.6); if (!far) { ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4, a = P(c.x, c.y, c.za + (-SEA - c.za) * f), b = P(c.x + 1, c.y, c.zb + (-SEA - c.zb) * f); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } } }
      else quad(ctx, [P(c.x, c.y, c.za), P(c.x, c.y + 1, c.zb), P(c.x, c.y + 1, -SEA), P(c.x, c.y, -SEA)], shade(col, 0.72), shade(col, 0.72), 0.6);
    }
    if (foam) { ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(6,18,36,.38)'; ctx.lineWidth = 3.2; ctx.stroke(); ctx.strokeStyle = 'rgba(228,244,255,.5)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); }
  },
};
