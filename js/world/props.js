// Scenery art for all sixteen districts. Each drawer paints one prop (ctx already shifted to the prop's elevation) and returns hit polygons for the clickable ones.
// This file is the front door: the drawers live in props-buildings.js (T3), props-street.js, props-nature.js and props-actors.js (T4) on top of the frozen helpers in props-common.js (T5);
// drawProp, farDraw and the far-view rule stay here (T5). What the art draws: buildings, ground props and machines in one lighting model (sun upper left, see iso.js and shading.js).
// What it never does: choose where anything stands (layout.js and kits.js do), change game state, or use Math.random (all variation is hashed from the prop's own position).
import { P, box, ellipse } from './iso.js';
import { hazeAt } from './shading.js';
import { drawSprite } from './sprites.js';
import { DRAW, LAYER, tint, body, hot, smoke, sign, signLeft } from './props-common.js';
import { roof } from './props-buildings.js';
import './props-street.js';
import './props-nature.js';
import './props-actors.js';

export { DRAW };

// ---------------------------------------------------------------- far view and dispatch
/** Far view: a plain shaded block with the prop's own colour (no windows, no animation). */
function farDraw(ctx, p, env) {
  const c = p.col || p.color || p.hull || p.acc || '#8a94a8';
  if (p.t === 'tree' || p.t === 'topiary') { ellipse(ctx, ...P(p.gx, p.gy, p.h * 0.6), 8, 7, tint(p.c || '#3f8a4a', env)); return null; }
  const f = box(ctx, p.gx, p.gy, p.w, p.d, Math.max(4, p.h), body(c, env));
  return p.hot ? hot(f) : null;
}
const KEEP_FAR = new Set(['board', 'bank', 'ipo', 'tower', 'crane', 'gantry', 'rentrow', 'exchange', 'hall', 'ship', 'gate', 'lookout']);
/** Draw one prop: through its sprite when it is a layer and the cache can serve it, else straight onto the scene. env.hz carries the prop's haze for the length of the call. */
export function drawProp(ctx, p, env) {
  if (env.far && !KEEP_FAR.has(p.t)) return farDraw(ctx, p, env);
  const prev = env.hz; env.hz = hazeAt(p.z || 0);
  try {
    const f = DRAW[p.t], L = LAYER[p.t];
    if (L && f === L.draw) { // a layer that nobody has replaced: serve its static body from the cache
      const polys = drawSprite(ctx, p, env, L);
      if (polys !== undefined) { if (L.live) L.live(ctx, p, env); return polys; }
    }
    return f ? f(ctx, p, env) : farDraw(ctx, p, env);
  } finally { env.hz = prev; }
}
/** A layer's definition (body, live, pad, night) by prop type: for tests and tools that need to know a sprite's box. */
export const layerOf = (t) => LAYER[t];
export const BUILDING = { body, smoke, sign, signLeft, roof, bldg: DRAW.bldg, hall: DRAW.hall };
