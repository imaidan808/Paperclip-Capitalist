// The ground pass's order: cliffs and their foam, the terrain, the roads, then each district's blocks and decals; and the moving decals over the cached copy.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Each step is a layer of stack.js ('shore', 'terrain', 'roads', 'blocks', 'livedecals'), so a track can replace one by flag.
import { P, quad, fogged } from './iso.js';
import { LAYOUT, DIST } from './layout.js';
import { FAR_ZOOM } from './common.js';
import { runLayer } from './stack.js';
import './groundart.js'; // the V2 ground layers register themselves here
import './water.js';

export const groundMethods = {
  /** Ground: coast cliffs, the terrain (drawn coarser the further out you are), roads and bridges between districts, each block's flat patches and decals. */
  drawGround(ctx, view, mode = 0) { // mode 0: everything; 1: what stands still (for the ground cache); 2: only what moves (water, pulses), over the cached ground
    if (mode === 2) { runLayer('livedecals', this, ctx, view); return; }
    const G = this.gnd, zoom = this.cam.z, far = zoom < FAR_ZOOM, see = (x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1;
    G.zoom = zoom; G.far = far; G.see = see; G.mode = mode;
    runLayer('shore', this, ctx, view, G);
    runLayer('terrain', this, ctx, view, G);
    runLayer('roads', this, ctx, view, G);
    runLayer('blocks', this, ctx, view, G);
  },

  /** Each district in view: its ground quads (block, walks, pad), its decals and its crosswalks. */
  drawBlocks(ctx, view, zoom, mode, see) {
    for (const id of LAYOUT.ids) {
      const D = DIST[id], b = D.bb; if (!see(b[0], b[1] + 200, b[2], b[3])) continue;
      const k = this.fxOf(id).dim, z = D.z;
      for (const g of D.ground) quad(ctx, [P(g.x, g.y, z), P(g.x + g.w, g.y, z), P(g.x + g.w, g.y + g.d, z), P(g.x, g.y + g.d, z)], k ? fogged(g.col, k) : g.col, g.kind === 'block' ? 'rgba(0,0,0,.4)' : null, 1.5);
      for (const d of D.decals) if (zoom >= (d.min ?? 0.3)) this.drawDecal(ctx, d, z, k, mode === 1 ? 1 : 0);
      if (zoom >= 0.4) this.drawMarks(ctx, D, z);
    }
  },
};
