// Soft shadows: the one cast-shadow rule and the stamps that draw it. See docs/ART_DIRECTION.md 2.3 and docs/RENDER_PLAN.md.
// Owner: T2 ATMOSPHERE (the light). Buildings, props and characters call these; none of them invents a shadow colour or a direction of its own.
//
// One sun, upper left. Cast shadows run towards +gx (down and to the right on screen) with a length of `shadowLength(night, dusk)` times the object's height, always the same cool violet
// (LIGHT.shadow, never black or ink). Nothing stands without a contact patch: a narrow dark ellipse and a wide pale one, pushed a little away from the sun.
//
// Cost: a soft ellipse is ONE cached sprite per colour (a radial falloff drawn once), stamped scaled with drawImage. No gradient is built per frame, no blur filter and no shadowBlur are
// used (the app's canvas on the CPU pays for every one of them). Where there is no OffscreenCanvas (the Node tests) a stamp falls back to two flat ellipses.
import { P, TW, quad, ellipse, clamp } from './iso.js';
import { LIGHT } from './palette.js';
import { surface } from './gfx.js';

/** One tile edge along a ground axis, in world pixels (the diamond is 64 x 32): the length a shadow measured in screen pixels covers per tile. */
export const EDGE_WPX = Math.hypot(TW / 2, TW / 4);
/** Alpha of the core of a cast shadow and of the penumbra 0.2 tile wider; and of the contact patch's narrow and wide ellipses. */
export const ALPHA = Object.freeze({ core: 0.26, penumbra: 0.10, contactNarrow: 0.30, contactWide: 0.12 });
export const PENUMBRA_TILES = 0.2;
/** How far the contact patch is pushed away from the sun, as a share of its radius. */
export const CONTACT_PUSH = 0.22;

/** The length of a cast shadow as a share of the object's height: 0.75 by day, 1.2 in the golden hours, 0.5 by moonlight. `night` and `dusk` are the world's (0..1). */
export function shadowLength(night, dusk) {
  const base = 0.75 + (0.5 - 0.75) * clamp(night, 0, 1);
  return base + (1.2 - base) * Math.min(1, clamp(dusk, 0, 1) * 1.25);
}
/** How many tiles a shadow reaches towards +gx for an object `h` world pixels high at the given light. */
export const shadowReach = (h, night, dusk) => (shadowLength(night, dusk) * h) / EDGE_WPX;

// ---------------------------------------------------------------- the soft ellipse sprite
const SOFT = new Map(); // colour -> { c, g } or null
const SIZE = 64;
function softSprite(color) {
  if (SOFT.has(color)) return SOFT.get(color);
  const s = surface(SIZE, SIZE); let out = null;
  if (s) { // a radial falloff: full to 45% of the radius, then a smooth fade to nothing at the rim
    const g = s.g, gr = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.45, color); gr.addColorStop(0.75, color + '66'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, SIZE, SIZE); out = s;
  }
  SOFT.set(color, out); return out;
}
const rgba = new Map();
const flat = (color, a) => { const k = color + Math.round(a * 100); let v = rgba.get(k); if (!v) { const n = parseInt(color.slice(1), 16); v = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; rgba.set(k, v); } return v; };
/** Give back the stamps (World.release calls this with the other caches). */
export function releaseShadows() { SOFT.clear(); }
/** Is there a sprite for stamps (an OffscreenCanvas)? When not, stamps are two flat ellipses. */
export const softStamps = () => softSprite(LIGHT.shadow) !== null;

/**
 * Stamp a soft ellipse of colour `color` centred at (x, y) with radii (rx, ry), at alpha `a`. The ctx's own state is left as it was found (alpha and nothing else is touched).
 * Minimum radius 1.5 so no stamp is a hairline.
 */
export function stampSoft(ctx, x, y, rx, ry, a, color = LIGHT.shadow) {
  rx = Math.max(rx, 1.5); ry = Math.max(ry, 1.5);
  const s = softSprite(color);
  if (s) { const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a; ctx.drawImage(s.c, x - rx, y - ry, rx * 2, ry * 2); ctx.globalAlpha = prev; }
  else { ellipse(ctx, x, y, rx, ry, flat(color, a * 0.8)); ellipse(ctx, x, y, rx * 0.62, ry * 0.62, flat(color, a * 0.5)); }
}
/** The contact patch under anything that stands: a narrow dark ellipse and a wide pale one, pushed away from the sun (down and to the right). (x, y) is the foot on screen. */
export function contactShadow(ctx, x, y, rx, ry) {
  const dx = rx * CONTACT_PUSH, dy = ry * CONTACT_PUSH;
  stampSoft(ctx, x + dx, y + dy, rx * 1.25, ry * 1.25, ALPHA.contactWide, LIGHT.contact);
  stampSoft(ctx, x + dx, y + dy, rx * 0.8, ry * 0.8, ALPHA.contactNarrow, LIGHT.contact);
}
/**
 * The cast shadow of an upright prism on the footprint [gx, gx + w] x [gy, gy + d], `h` high: the footprint swept towards +gx by the shadow's reach, in two passes, a penumbra 0.2 tile
 * wider at low alpha and the core at 0.26. `light` is { night, dusk } (the world's). The shadow lies on the ground at elevation `z`.
 */
export function castShadow(ctx, gx, gy, w, d, h, light, z = 0) {
  const len = shadowReach(h, light ? light.night : 0, light ? light.dusk : 0), pen = PENUMBRA_TILES, prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * ALPHA.penumbra;
  quad(ctx, [P(gx - pen, gy - pen, z), P(gx + w + len + pen, gy - pen, z), P(gx + w + len + pen, gy + d + pen, z), P(gx - pen, gy + d + pen, z)], LIGHT.shadow);
  ctx.globalAlpha = prev * ALPHA.core;
  quad(ctx, [P(gx, gy, z), P(gx + w + len, gy, z), P(gx + w + len, gy + d, z), P(gx, gy + d, z)], LIGHT.shadow);
  ctx.globalAlpha = prev;
}
