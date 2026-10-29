// Mist over locked districts and over one that is opening. LEGACY drawer: a dark pool and sliding blurred banks (lighting.js). The cloud banks replace it.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md).
import { P } from './iso.js';
import { DIST } from './layout.js';
export { BANK, bankPuffs, bankScale, bankMs, coverage, structure } from './cloudbank.js'; // the bank's geometry (docs/RENDER_PLAN.md T2): the V2 drawer is built on it, tests/world-cloudbank.test.mjs holds it to the plan

export const cloudMethods = {
  /** Mist over locked districts and over one that is opening: a soft dark pool centred on the district, thickest at its heart, with slow banks of cloud (lighting.js). */
  drawFog(ctx, vz) {
    const t = this.vt;
    for (const id of vz) {
      const fx = this.fxOf(id); if (fx.fog <= 0.01) continue;
      const D = DIST[id], F = D.fp, [X, Y] = P(F[0] + F[2] / 2, F[1] + F[3] / 2, D.z + 24), R = (F[2] + F[3]) * 18;
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.62);
      this.light.fog(ctx, R, fx.fog, t, this.far);
      ctx.restore();
    }
  },
};
