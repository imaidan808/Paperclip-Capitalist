// Nature and plantings: trees, dead trees, planters, topiary, hedges, hay.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md).
import { P, blob, ellipse, tree, snowA } from './iso.js';
import { solid } from './shading.js';
import { tint, body, lite, stroke, DRAW } from './props-common.js';

Object.assign(DRAW, {
  tree(ctx, p, env) { tree(ctx, p.gx, p.gy, p.s || 1, Math.sin(env.t / 900 + (p.seed || 0)) * 2 * env.wind, tint(p.c || '#2f7d4b', env)); return null; },
  deadtree(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    blob(ctx, x + 3, y + 1, 9, 3.5, 0.25);
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30); ctx.lineWidth = 2; ctx.moveTo(x, y - 18); ctx.lineTo(x - 10, y - 34); ctx.moveTo(x, y - 24); ctx.lineTo(x + 9, y - 38); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x - 1, y - 30); ctx.stroke();
    return null;
  },
  planter(ctx, p, env) {
    solid(ctx, p.gx, p.gy, p.w, p.d, 6, body('#8a8f98', env), { mat: 'stone', lite: true }); const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 6);
    ellipse(ctx, x, y - 3, p.w * 22, p.w * 11, tint('#3f8a4a', env)); ellipse(ctx, x - 2, y - 6, p.w * 13, p.w * 7, tint('#5aa85a', env)); ellipse(ctx, x - 4, y - 7, p.w * 6, p.w * 3, snowA(0.14));
    return null;
  },
  topiary(ctx, p, env) {
    const [x, y] = P(p.gx + 0.25, p.gy + 0.25); blob(ctx, x + 3, y + 1, 9, 3.6, 0.28);
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x - 1.5, y - 16, 3, 16); ellipse(ctx, x, y - 22, 9, 10, tint('#2f6a3a', env)); ellipse(ctx, x - 2, y - 25, 5, 5, tint('#4a8a4a', env)); ellipse(ctx, x - 3.5, y - 26.5, 2.4, 2.2, snowA(0.16));
    return null;
  },
  hedge(ctx, p, env) { const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col || '#2f5a3a', env), { lite: true }); ctx.beginPath(); const t = f.top; ctx.moveTo(t[3][0], t[3][1] + 0.5); ctx.lineTo(t[2][0], t[2][1] + 0.5); stroke(ctx, snowA(0.14), 1); return null; },
  hay(ctx, p, env) {
    const [x, y] = P(p.gx + 0.4, p.gy + 0.4); blob(ctx, x, y + 1, 16, 6, 0.26);
    for (const dx of [-5, 6]) { ellipse(ctx, x + dx, y - 5, 8, 4.5, tint('#c9a13a', env)); ellipse(ctx, x + dx, y - 9, 8, 4.5, tint('#e0bb52', env)); ctx.strokeStyle = tint('#a8822a', env); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + dx, y - 9, 4, 2.2, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x + dx, y - 9, 7, 3.8, 0, Math.PI * 1.1, Math.PI * 1.7); stroke(ctx, snowA(0.28), 1); }
    return null;
  },

});
