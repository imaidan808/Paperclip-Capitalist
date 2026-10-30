// The freight trucks and the traffic of the toy island's roads, as V2 drawers of the `truck` and `car` layers.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 4.4: a toy freight truck is a rounded white box with a blue stripe on a rounded bed, a cab with a glass dome, round wheels with hub dots, an amber
// beacon that pulses softly at night (and stays lit while customs holds the truck at the border) and a small trail of round exhaust puffs; the road traffic is capsule toy cars in the toy colours with a glass dome, hub-dotted
// wheels and headlights at night, fading in and out at the road ends. A car is one sprite per colour and way (atlas.js), blitted along its road; a truck is drawn live (there are few).
// The hits and labels are the legacy ones, exactly: the truck's circle and its chip, nothing for a car.
import { registerLayer } from './stack.js';
import { ZONES } from '../config.js';
import { zAt } from './layout.js';
import { P, clamp } from './iso.js';
import { TOY, GLASS, METAL } from './palette.js';
import { roundedBox } from './solids.js';
import { blit } from './atlas.js';
import { mix, shade, hi, shd, disc, rr, stand, stampSoft, castShadow, fq, facePoint, fade } from './toys.js';

const PLUM = '#4b4770', GLASSC = GLASS.mid;
function wheel(g, x, y, r) { disc(g, x, y, r, r, '#34315a'); disc(g, x - r * 0.1, y - r * 0.1, r * 0.82, r * 0.82, PLUM); disc(g, x, y, r * 0.42, r * 0.42, METAL.steelLight); }
function puff(g, x, y, r, a) { g.globalAlpha = a; disc(g, x, y, r, r, '#d6dcf0'); disc(g, x - r * 0.16, y - r * 0.18, r * 0.84, r * 0.84, '#f6f8ff'); g.globalAlpha = 1; }

// ---------------------------------------------------------------- the truck
function drawTruckV2(ctx, view, env, w, e) {
  const [gx, gy] = w.truckPos(e), z = zAt(gx, gy), [x, y] = P(gx, gy, z), alongY = e.dirY, blocked = w.env.tariff, big = env.far ? 1.6 : 1, t = env.t;
  ctx.save(); ctx.translate(0, -z);
  const wd = (alongY ? 0.8 : 1.7) * big, d = (alongY ? 1.7 : 0.8) * big, lead = e.hd < 0 ? -0.85 : 0.35;
  const [sx, sy] = P(gx, gy, 0); castShadow(ctx, gx - wd / 2, gy - d / 2, wd, d, 18, { night: env.night || 0, dusk: 0 }); stand(ctx, sx, sy + 2, 20 * big, 8 * big);
  const cab = alongY ? [gx - 0.4 * big, gy + lead * big, 0.8 * big, 0.5 * big] : [gx + lead * big, gy - 0.4 * big, 0.5 * big, 0.8 * big];
  if (!env.far) for (const [ox, oy] of [[-0.3, -0.62], [0.3, 0.62], [-0.3, 0.62], [0.3, -0.62]]) { const [wx, wy] = P(gx + (alongY ? ox : oy), gy + (alongY ? oy : ox), 0); wheel(ctx, wx, wy - 3, 4.2); }
  const B = roundedBox(ctx, gx - wd / 2, gy - d / 2, wd, d, 16, '#fffaf0', { z: 3, r: 4.4 }); fq(ctx, B.left, 0.02, 0.98, 0.34, 0.5, '#4a8ff0'); fq(ctx, B.right, 0.02, 0.98, 0.34, 0.5, '#3a6fc0');
  const C = roundedBox(ctx, cab[0], cab[1], cab[2], cab[3], 12, '#4a8ff0', { z: 3, r: 4 }); fq(ctx, C.left, 0.1, 0.9, 0.5, 0.88, GLASSC); fq(ctx, C.right, 0.1, 0.9, 0.5, 0.88, shade(GLASSC, 0.72)); { const alpha0 = fade(ctx, 0.55); fq(ctx, C.left, 0.14, 0.34, 0.54, 0.86, '#ffffff'); ctx.globalAlpha = alpha0; }
  if (!env.far) { const [bx, by] = P(cab[0] + cab[2] / 2, cab[1] + cab[3] / 2, 17), lit = blocked || env.night > 0.3 ? (t ? 0.55 + 0.45 * Math.sin((t / 1800) * Math.PI * 2) : 1) : 0; disc(ctx, bx, by, 2.4, 2.4, mix('#a8841f', '#ffb347', 0.3 + 0.7 * lit)); }
  ctx.restore();
  if (t && !blocked && !env.far) for (let i = 0; i < 2; i++) { const k = ((t / 500) + i / 2) % 1; puff(ctx, x + (alongY ? e.hd : -e.hd) * (8 + k * 14), y - 6 - k * 6, 2 + k * 3.2, 0.5 * (1 - k)); }
  w.hits.push({ eid: e.id, kind: 'truck', id: e.f.id, zone: 0, label: `Freight run to ${ZONES[e.f.to].short}`, circle: [x, y - 12, 20 * big] });
  w.overlay.push({ k: 'chip', n: 16, wx: x, wy: y - 40, draw: (g, px, py, s) => w.chip(g, px, py, `${e.f.items.length} crate${e.f.items.length > 1 ? 's' : ''} to ${ZONES[e.f.to].short}`, '#ffd36e', s) });
}
registerLayer('truck', drawTruckV2, 'inherit');

// ---------------------------------------------------------------- the traffic
const CARS = [TOY.red, TOY.blue, TOY.yellow, TOY.violet, TOY.green, '#fffaf0'];
function carSprite(g, c, horiz) {
  const w = horiz ? 1.1 : 0.56, d = horiz ? 0.56 : 1.1;
  stampSoft(g, 4, 3, 24, 8, 0.2); stand(g, 0, 2, 19, 7.4);
  for (const [ox, oy] of [[-0.32, -0.22], [0.32, 0.22], [-0.32, 0.22], [0.32, -0.22]]) { const [wx, wy] = P(horiz ? ox * w * 1.7 : oy * w, horiz ? oy * d : ox * d * 1.7, 0); wheel(g, wx, wy - 2.6, 3.2); }
  const B = roundedBox(g, -w / 2, -d / 2, w, d, 5, c, { z: 2.6, r: 3 }), K = roundedBox(g, -w * 0.24, -d * 0.24, w * 0.48, d * 0.48, 4.8, shade(c, 0.95), { z: 7.6, r: 2.8, edge: false });
  fq(g, K.left, 0.08, 0.92, 0.24, 0.88, GLASSC); fq(g, K.right, 0.08, 0.92, 0.24, 0.88, shade(GLASSC, 0.72)); { const alpha0 = fade(g, 0.55); fq(g, K.left, 0.12, 0.3, 0.32, 0.84, '#ffffff'); g.globalAlpha = alpha0; }
  const [hx, hy] = facePoint(B.left, 0.04, 0.5); disc(g, hx, hy, 1.5, 1.5, '#fff3c4');
}
const RECT = [-30, -30, 34, 14];
function drawCarV2(ctx, view, env, w, c) {
  const z = zAt(c.gx, c.gy), [x, y] = P(c.gx, c.gy, 0), col = CARS[c.i % 6];
  ctx.save(); ctx.translate(0, -z); ctx.globalAlpha = c.fade;
  blit(ctx, `car|${col}|${c.horiz ? 1 : 0}`, RECT, (g) => carSprite(g, col, c.horiz), x, y);
  if (env.night > 0.3 && !env.far && env.lights) { const [lx, ly] = P(c.gx, c.gy, 6); env.lights.push({ wx: lx, wy: ly - z, r: 26, c: '255,240,190', a: 0.5 * env.night }); }
  ctx.restore(); ctx.globalAlpha = 1;
}
registerLayer('car', drawCarV2, 'inherit');
