// Machines and cargo of the toy island's districts, as V2 drawers: the scrap yard's crane, the harbor gantry, the cargo ship, junk cars, the handcart, tanks, silos, stacks, the radome, the dish, the windmill, car rows
// and container stacks.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.1 (industrial is fat: a tank is 1.6 tiles wide, cylinders have domed lids and rounded base rings, stacks taper), 4.1 and 4.2 (autos,
// containers): chunky yellow A-frame crane with a round cab, a striped jib tip and a swinging magnet that carries a crate; an orange gantry; a navy ship with portholes, a striped funnel, container stacks, a bow of foam and a wake;
// round smoke puffs from the stack; a white radome with a sliding cyan slit; a dish that nods; a windmill with four rounded sails that turn once in 9 s. Static art is a cached sprite body; whatever moves (the trolley,
// the sails, the smoke, the wake) is the live part and stands still under Calm, Off and reduced motion.
import { registerProp } from './stack.js';
import { shared } from './atlas.js';
import { METAL, TOY, SEA, ROAD, WOOD, GLASS, GRASS, BLOOM, TILE, PAVE, LIGHT } from './palette.js';
import { roundedBox } from './solids.js';
import { plankBox } from './stock.js';
import { stampGlow } from './gfx.js';
import { P, col, lifted, toyOf, hi, shd, ball, disc, rr, poly, bar, post, drum, stand, stampSoft, castShadow, fq, facePoint, mix, shade, clamp, seedOf } from './toys.js';
import { h2 } from './iso.js';

const YEL = { hi: '#ffe27a', mid: '#ffd84d', shade: '#f4bb3e', deep: '#cb9022' };
const cast = (g, p, h, env, k = 1) => castShadow(g, p.gx, p.gy, p.w, p.d, h * k, { night: env.night || 0, dusk: 0 });
const puffCloud = (ctx, x, y, r, a, c = '#f6f8ff') => { ctx.globalAlpha = a; disc(ctx, x, y, r, r, shade(c, 0.88)); disc(ctx, x - r * 0.14, y - r * 0.16, r * 0.86, r * 0.86, c); disc(ctx, x - r * 0.3, y - r * 0.4, r * 0.34, r * 0.22, '#ffffff'); ctx.globalAlpha = 1; };

// ---------------------------------------------------------------- the crane and the gantry
shared('crane', {
  body(g, p, env) {
    const [x, y] = P(p.gx, p.gy), y1 = YEL, c = (k) => col(y1[k], env), top = y - 112;
    cast(g, p, 100, env, 0.8); stampSoft(g, x + 8, y + 3, 32, 11, 0.2); stand(g, x, y + 1, 20, 8);
    for (const dx of [-18, 7]) rr(g, x + dx, y - 5, 12, 6.4, 2.4, col(METAL.steelMid, env));
    const Lp = (t) => [x - 15 + 10 * t, y - 2 - 110 * t], Rp = (t) => [x + 15 - 10 * t, y - 2 - 110 * t]; // the lattice between the legs: diagonals, alternating
    for (let i = 0; i < 5; i++) { const a = i % 2 ? Rp(i / 5) : Lp(i / 5), b = i % 2 ? Lp((i + 1) / 5) : Rp((i + 1) / 5); bar(g, a[0], a[1], b[0], b[1], 3.4, c('shade')); }
    bar(g, x + 15, y - 2, x + 5, top, 7.6, c('deep')); bar(g, x - 15, y - 2, x - 5, top, 7.6, c('shade')); g.globalAlpha *= 0.55; bar(g, x - 16.4, y - 4, x - 6.4, top + 2, 2.4, c('hi')); g.globalAlpha /= 0.55;
    for (let i = 1; i < 5; i++) { const t = i / 5, xl = x - 15 + 10 * t, xr = x + 15 - 10 * t; bar(g, xl, y - 112 * t, xr, y - 112 * t - 2, 3.4, c('shade')); }
    const jy = top - 4; // the jib: a fat arm out to the left with a striped tip, a counterweight to the right, the cab on the mast
    bar(g, x - 72, jy, x + 26, jy, 7.6, c('mid')); bar(g, x - 72, jy - 1.8, x + 26, jy - 1.8, 2.6, c('hi'));
    for (let i = 0; i < 4; i++) bar(g, x - 70 + i * 5, jy, x - 66 + i * 5, jy, 7.8, i % 2 ? col('#fffaf0', env) : col(TOY.red, env));
    rr(g, x + 14, jy - 8, 16, 14, 3.4, shd(col(METAL.steelMid, env))); rr(g, x + 14, jy - 8, 14.4, 12.6, 3.4, col(METAL.steelLight, env));
    rr(g, x - 12, jy - 12, 24, 19, 5.4, shd(col('#fffaf0', env))); rr(g, x - 12, jy - 12, 22, 17, 5.4, col('#fffaf0', env)); rr(g, x - 9, jy - 9, 13, 10, 3.6, col(GLASS.mid, env)); g.globalAlpha *= 0.55; rr(g, x - 7, jy - 8, 4, 3, 1.4, '#ffffff'); g.globalAlpha /= 0.55;
    bar(g, x + 6, jy - 12, x + 6, jy - 24, 3, c('shade')); ball(g, x + 6, jy - 25.6, 2.6, col(TOY.red, env));
    return null;
  },
  live(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy), jy = y - 116, trol = x - 40 + (env.t ? Math.sin(env.t / 2600) * 22 : 0), hook = 46 + (env.t ? Math.sin(env.t / 1700) * 12 : 0), my = jy + hook;
    rr(ctx, trol - 5, jy - 3, 10, 8, 2.4, col(METAL.steelMid, env)); bar(ctx, trol, jy + 3, trol, my - 2, 2.2, col('#4a3f78', env));
    drum(ctx, trol, my + 2, 7.4, 3.6, col(TOY.red, env));
    ctx.save(); ctx.translate(trol, my + 14); plankBox(ctx, -0.25, -0.25, 0.5, 0.5, 9, 0, col('#ff9a3a', env), { r: 2.6, arrow: false }); ctx.restore(); // the carried crate hangs under the magnet
    if (env.night > 0.2) { ball(ctx, x - 70, jy, 2.6, '#ff4d4d'); }
  },
  vary: [], ext: [40, 30, 6, 6],
});
shared('gantry', {
  body(g, p, env) {
    const [x0, y0] = P(p.gx, p.gy + p.d / 2), [x1, y1] = P(p.gx + p.w, p.gy + p.d / 2), H = p.h, c = col(lifted(p.col || TOY.orange, 0.55), env);
    stampSoft(g, (x0 + x1) / 2 + 8, (y0 + y1) / 2 + 3, Math.abs(x1 - x0) / 2 + 14, 9, 0.2);
    for (const [x, y] of [[x0, y0], [x1, y1]]) { stand(g, x, y, 12, 5); bar(g, x + 7, y, x + 3, y - H, 7, shade(c, 0.8)); bar(g, x - 7, y, x - 3, y - H, 7, c); bar(g, x - 6, y - H * 0.42, x + 6, y - H * 0.42, 3.4, shade(c, 0.9)); bar(g, x - 7, y - 1, x + 7, y - 1, 5, col(METAL.steelMid, env)); g.globalAlpha *= 0.5; bar(g, x - 8.4, y - 4, x - 4.2, y - H + 2, 2.2, hi(c, 0.8)); g.globalAlpha /= 0.5; }
    bar(g, x0, y0 - H, x1, y1 - H, 8, c); bar(g, x0, y0 - H - 2.4, x1, y1 - H - 2.4, 2.6, hi(c, 0.6)); bar(g, x0, y0 - H * 0.5, x1, y1 - H * 0.5, 3.4, shade(c, 0.88)); ball(g, x0, y0 - H - 3, 3, c); ball(g, x1, y1 - H - 3, 3, c);
    return null;
  },
  live(ctx, p, env) {
    const [x0, y0] = P(p.gx, p.gy + p.d / 2), [x1, y1] = P(p.gx + p.w, p.gy + p.d / 2), H = p.h, f = 0.5 + 0.38 * (env.t ? Math.sin(env.t / 2800) : 0), tx = x0 + (x1 - x0) * f, ty = y0 + (y1 - y0) * f - H, hook = 18 + 10 * (env.t ? Math.sin(env.t / 1900 + 1) : 0);
    rr(ctx, tx - 6, ty - 4, 12, 8, 2.6, col(METAL.steelMid, env)); bar(ctx, tx, ty + 2, tx, ty + hook, 2.2, col('#4a3f78', env));
    const c = col(toyOf(['#c0392b', '#2f80ed', '#f2994a'][(p.gx | 0) % 3]), env);
    rr(ctx, tx - 9, ty + hook, 18, 11, 3, shd(c)); rr(ctx, tx - 9, ty + hook, 16, 9, 3, c); for (let i = 1; i < 4; i++) { ctx.globalAlpha = 0.3; rr(ctx, tx - 9 + i * 4, ty + hook + 1.5, 1.6, 6.4, 0.8, shade(c, 0.7)); ctx.globalAlpha = 1; }
  },
  vary: ['col'], ext: [6, 6, 6, 6],
});

// ---------------------------------------------------------------- the ship (a plain drawer: the whole boat bobs)
const HULL = '#2f5fa8', BOXES = [TOY.red, TOY.blue, TOY.orange, TOY.green, TOY.cyan];
registerProp('ship', {
  draw(ctx, p, env) {
    const bob = env.t ? Math.sin((env.t / 5500) * Math.PI * 2) * 1.2 : 0, rock = env.t ? Math.sin((env.t / 5500) * Math.PI * 2 + 1) * 0.0262 : 0, [cx, cy] = P(p.gx + p.w / 2, p.gy + p.d / 2, -2);
    stampSoft(ctx, cx + 6, cy + 5, p.w * 24, p.d * 12, 0.26);
    ctx.save(); ctx.translate(0, bob); ctx.translate(cx, cy); ctx.rotate(rock); ctx.translate(-cx, -cy);
    { const [bx, by] = P(p.gx - 0.1, p.gy + p.d / 2, -1.6); ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.ellipse(bx + 2, by + 3, 15, 6.4, 0, 0, 6.3); ctx.fillStyle = '#fbfffe'; ctx.fill(); ctx.beginPath(); ctx.ellipse(bx + 6, by + 3, 11, 4.4, 0, 0, 6.3); ctx.fillStyle = '#c4f4e6'; ctx.fill(); ctx.globalAlpha = 1; } // the bow's foam, lying on the water under the hull
    const hull = col(HULL, env), F = roundedBox(ctx, p.gx, p.gy, p.w, p.d, p.h, hull, { z: -2, r: 8 });
    fq(ctx, F.left, 0.0, 1, 0.0, 0.14, col(TOY.red, env)); fq(ctx, F.right, 0.0, 1, 0.0, 0.14, shade(col(TOY.red, env), 0.7)); fq(ctx, F.left, 0.0, 1, 0.62, 0.84, col(lifted(p.acc || TOY.orange, 0.6), env)); fq(ctx, F.right, 0.0, 1, 0.62, 0.84, shade(col(lifted(p.acc || TOY.orange, 0.6), env), 0.72));
    for (let i = 0; i < 6; i++) { const [px, py] = facePoint(F.left, 0.1 + i * 0.14, 0.34); disc(ctx, px, py, 2, 2, col('#fff3d6', env)); disc(ctx, px, py, 1.2, 1.2, col(GLASS.mid, env)); }
    const n = Math.floor(p.w / 1.2);
    for (let i = 0; i < n - 1; i++) { const c = col(BOXES[(i + ((p.gx | 0) % 3)) % BOXES.length], env), Fc = roundedBox(ctx, p.gx + 0.3 + i * 1.1, p.gy + 0.35, 0.95, p.d - 0.7, 8, c, { z: p.h - 2, r: 2.4 }); for (let r = 1; r < 5; r++) fq(ctx, Fc.left, r / 5 - 0.02, r / 5 + 0.02, 0.1, 0.9, shade(c, 0.76)); }
    const C = roundedBox(ctx, p.gx + p.w - 1.3, p.gy + 0.28, 1.1, p.d - 0.56, 13, col('#fffaf0', env), { z: p.h - 2, r: 3.4 }); fq(ctx, C.left, 0.1, 0.9, 0.58, 0.84, col(GLASS.mid, env));
    for (let i = 0; i < 3; i++) { const [px, py] = facePoint(C.left, 0.22 + i * 0.28, 0.3); disc(ctx, px, py, 1.7, 1.7, col(GLASS.mid, env)); }
    const [fx, fy] = P(p.gx + p.w - 0.7, p.gy + p.d / 2, p.h + 11); drum(ctx, fx, fy + 4, 5, 11, col(TOY.red, env), { ribs: [0.6], ribCol: col('#fffaf0', env) });
    ctx.restore();
    if (!env.far) { const [sx, sy] = P(p.gx + p.w - 0.7, p.gy + p.d / 2, p.h + 24); for (let i = 0; i < 3; i++) { const k = env.t ? ((env.t / 3200) + i / 3) % 1 : 0.2 + i * 0.28; puffCloud(ctx, sx + k * 12, sy + bob - k * 26, 3.4 + k * 4, 0.9 * (1 - k), '#f6f8ff'); } }
    if (!env.far) for (let i = 0; i < 4; i++) { const k = env.t ? ((env.t / 2400) + i / 4) % 1 : i / 4, [wx, wy] = P(p.gx + p.w + 0.3 + k * 2.8, p.gy + p.d / 2, -1.4); ctx.globalAlpha = 0.6 * (1 - k); ctx.beginPath(); ctx.ellipse(wx, wy + 4, 6 + k * 16, 2.4 + k * 6.4, 0, 0, 6.3); ctx.strokeStyle = '#fbfffe'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.globalAlpha = 1; }
    return null;
  },
});

// ---------------------------------------------------------------- junk car, handcart
shared('junkcar', {
  body(g, p, env) {
    const c = col(toyOf(p.color || TOY.orange), env), [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2);
    cast(g, p, 22, env); stand(g, mx, my + 2, 28, 12);
    const B = roundedBox(g, p.gx, p.gy, p.w, p.d, 9, c, { z: 4, r: 4 }), K = roundedBox(g, p.gx + p.w * 0.25, p.gy + 0.15, p.w * 0.5, p.d - 0.3, 8, shade(c, 0.92), { z: 13, r: 3.6 });
    fq(g, K.left, 0.08, 0.92, 0.3, 0.86, col(GLASS.mid, env)); fq(g, K.right, 0.08, 0.92, 0.3, 0.86, shade(col(GLASS.mid, env), 0.7)); fq(g, B.left, 0.52, 0.74, 0.15, 0.8, col('#4a3f78', env)); // the missing door
    fq(g, B.left, 0.06, 0.3, 0.45, 0.7, col('#c9693d', env)); fq(g, B.left, 0.8, 0.96, 0.2, 0.5, col('#c9693d', env));
    for (const u of [0.2, 0.82]) { const [wx, wy] = facePoint(B.left, u, 0.0); disc(g, wx, wy - 1, 5.2, 5.2, col('#4b4770', env)); disc(g, wx, wy - 1, 2.4, 2.4, col(METAL.steelMid, env)); }
    const [gx, gy] = P(p.gx + p.w * 0.84, p.gy + p.d * 0.5, 13); for (const dx of [-3, 0, 3]) bar(g, gx, gy, gx + dx, gy - 6 - Math.abs(dx), 3, col(GRASS.mid, env)); // a weed through the bonnet
    return null;
  }, vary: ['color'], ext: [8, 6, 10, 11],
});
shared('cart', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), awn = col(lifted(p.awn || '#e8503a', 0.55), env), wood = col(WOOD.mid, env);
    cast(g, p, 22, env, 0.8); stand(g, x, y + 3, 28, 11);
    for (const dx of [-17, 17]) { disc(g, x + dx, y + 2, 7.4, 7.4, col('#4b4770', env)); disc(g, x + dx, y + 2, 5.2, 5.2, col(WOOD.light, env)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; bar(g, x + dx - Math.cos(a) * 4.6, y + 2 - Math.sin(a) * 4.6, x + dx + Math.cos(a) * 4.6, y + 2 + Math.sin(a) * 4.6, 1.5, col(WOOD.shade, env)); } disc(g, x + dx, y + 2, 1.7, 1.7, col('#d9a52c', env)); }
    const F = roundedBox(g, p.gx, p.gy, p.w, p.d, 8, wood, { z: 4, r: 3 }); fq(g, F.left, 0.05, 0.95, 0.32, 0.4, shade(wood, 0.7));
    const fr = [TOY.red, TOY.orange, TOY.green, '#ffd84d', TOY.red, TOY.orange]; for (let i = 0; i < 6; i++) { const [fx, fy] = P(p.gx + 0.2 + (i % 3) * 0.45, p.gy + 0.2 + (i >> 1) * 0.2, 12.4); ball(g, fx, fy - 2.4, 3.6, col(fr[i], env)); }
    for (const dx of [-14, 14]) bar(g, x + dx, y - 12, x + dx, y - 30, 3.2, col(WOOD.shade, env));
    const l = x - 21, r = x + 21, t1 = y - 33, t2 = y - 29; poly(g, [[l, t2 + 4], [r, t2 + 4], [r - 5, t1 - 2], [l + 5, t1 - 2]], shade(awn, 0.84));
    for (let i = 0; i < 6; i++) { const u0 = i / 6, u1 = (i + 1) / 6; poly(g, [[l + 42 * u0, t2 + 4], [l + 42 * u1, t2 + 4], [l + 5 + 32 * u1, t1 - 2], [l + 5 + 32 * u0, t1 - 2]], i % 2 ? col('#fffaf0', env) : awn); disc(g, l + 42 * (u0 + u1) / 2, t2 + 4.4, 3.5, 2.8, i % 2 ? col('#fffaf0', env) : awn); }
    bar(g, x - 26, y - 1, x - 20, y - 6, 3, wood); bar(g, x + 26, y - 1, x + 20, y - 6, 3, wood);
    return null;
  }, vary: ['awn'], ext: [9, 6, 6, 9],
});

// ---------------------------------------------------------------- tanks, silos, stacks, the radome, the dish, the windmill
shared('tank', {
  body(g, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [x, y] = P(cx, cy), rx = p.w * 17.6, c = col(lifted(p.col || METAL.steelLight, 0.7), env), acc = col(lifted(p.acc || TOY.yellow, 0.6), env);
    stampSoft(g, x + 12, y + 5, rx * 1.9, rx * 0.9, 0.22); stand(g, x, y + 2, rx * 1.1, rx * 0.5); drum(g, x, y + 3, rx * 1.06, 5, shade(c, 0.9));
    drum(g, x, y, rx, p.h, c, { dome: 8, domeCol: hi(c, 0.35) });
    for (const k of [0.3, 0.6]) { g.beginPath(); g.ellipse(x, y - p.h * k, rx, rx * 0.5, 0, 0.02, Math.PI - 0.02, false); g.strokeStyle = acc; g.lineWidth = 5; g.stroke(); g.beginPath(); g.ellipse(x, y - p.h * k - 1.4, rx, rx * 0.5, 0, 0.3, Math.PI - 0.6, false); g.strokeStyle = hi(acc, 0.5); g.globalAlpha *= 0.6; g.lineWidth = 1.8; g.stroke(); g.globalAlpha /= 0.6; }
    const lx = x + rx * 0.62, ly = y + rx * 0.3; bar(g, lx, ly, lx, ly - p.h + 2, 3, col(METAL.steelMid, env)); bar(g, lx + 5, ly - 1, lx + 5, ly - p.h + 1, 3, col(METAL.steelMid, env)); for (let i = 1; i < 6; i++) bar(g, lx, ly - i * p.h / 6.4, lx + 5, ly - i * p.h / 6.4, 2.2, col(METAL.steelHi, env));
    bar(g, x - rx - 3, y + 2, x - rx - 16, y + 8, 5, col(METAL.steelMid, env)); ball(g, x - rx - 16, y + 8.4, 3.4, col(METAL.steelLight, env)); ball(g, x - rx - 3, y + 2, 3, col(METAL.steelLight, env));
    return null;
  }, vary: ['col', 'acc'], ext: [6, 6, 6, 6],
});
shared('silo', {
  body(g, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [x, y] = P(cx, cy), rx = p.w * 15.2, c = col(lifted(p.col || '#e8eef6', 0.8), env);
    stampSoft(g, x + 12, y + 5, rx * 2, rx * 0.9, 0.22); stand(g, x, y + 2, rx * 1.1, rx * 0.5); drum(g, x, y + 3, rx * 1.05, 4, shade(c, 0.9));
    drum(g, x, y, rx, p.h, c, { dome: 12, domeCol: col('#b8c4e0', env), ribs: [0.12, 0.3, 0.48, 0.66, 0.84], ribCol: shade(c, 0.9), ribW: 2.2 });
    rr(g, x - 4, y - 14, 8, 14, 4, col('#8392b4', env)); rr(g, x - 3, y - 13, 6, 12, 3, col('#5b6890', env));
    const lx = x + rx * 0.7, ly = y + rx * 0.25; bar(g, lx, ly, lx, ly - p.h, 3, col(METAL.steelMid, env)); ball(g, x, y - p.h - 12, 3, col(TOY.red, env));
    return null;
  }, vary: ['col'], ext: [6, 6, 6, 6],
});
shared('stack', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45), c = col(lifted(p.col || METAL.steelLight, 0.72), env), acc = col(lifted(p.acc || TOY.yellow, 0.6), env), h = p.h;
    cast(g, p, h, env, 0.9); stand(g, x, y + 2, 17, 7.4); drum(g, x, y + 3, 15, 5, shade(c, 0.9));
    g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x - 9, y - h); g.lineTo(x + 9, y - h); g.lineTo(x + 12, y); g.ellipse(x, y, 12, 6, 0, 0, Math.PI, false); g.closePath(); const gr = g.createLinearGradient(x - 12, 0, x + 12, 0); gr.addColorStop(0, hi(c, 0.15)); gr.addColorStop(0.45, c); gr.addColorStop(1, shd(c)); g.fillStyle = gr; g.fill();
    for (const [k, cc] of [[0.18, acc], [0.4, col('#fffaf0', env)], [0.62, acc]]) { const yy = y - h * (1 - k) + 2, rw = 9 + 3 * (1 - k) - 0.8; g.beginPath(); g.ellipse(x, yy, rw, rw * 0.5, 0, 0.02, Math.PI - 0.02, false); g.strokeStyle = cc; g.lineWidth = 7; g.stroke(); }
    disc(g, x, y - h, 9.6, 4.8, shade(c, 0.78)); disc(g, x, y - h + 0.4, 8.2, 4, col('#3d3a5c', env)); disc(g, x, y - h + 1, 6.4, 3, col('#2c2a56', env));
    return null;
  },
  live(ctx, p, env) { if (env.far) return; const [x, y] = P(p.gx + 0.45, p.gy + 0.45, p.h); for (let i = 0; i < 4; i++) { const k = env.t ? ((env.t / 3200) + i / 4) % 1 : 0.15 + i * 0.22; puffCloud(ctx, x + k * 10 + Math.sin(k * 5 + i) * 2.4, y - 2 - k * 36, 4 + k * 6.4, 0.95 * (1 - k * k)); } },
  vary: ['col', 'acc'], ext: [9, 6, 12, 12],
});
shared('dome', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), r = p.w * 25, h = Math.max(24, p.h * 1.5), c = col('#fffaf0', env);
    stampSoft(g, x + 8, y + 5, r * 1.8, r * 0.8, 0.22); stand(g, x, y + 2, r * 1.1, r * 0.5); drum(g, x, y + 1, r, 5, col(METAL.steelLight, env));
    g.beginPath(); g.ellipse(x, y - 5, r, h, 0, Math.PI, 0); g.closePath(); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(x - r * 0.06, y - 5.6, r * 0.93, h * 0.96, 0, Math.PI, 0); g.closePath(); g.fillStyle = c; g.fill();
    for (const k of [0.3, 0.62]) { g.beginPath(); g.ellipse(x, y - 5, r * k, h, 0, Math.PI, 0); g.strokeStyle = shade(c, 0.84); g.lineWidth = 2; g.stroke(); } g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x, y - 5 - h); g.strokeStyle = shade(c, 0.84); g.lineWidth = 2; g.stroke();
    g.globalAlpha *= 0.6; g.beginPath(); g.ellipse(x - r * 0.34, y - h * 0.6, r * 0.2, h * 0.2, -0.6, 0, 6.3); g.fillStyle = '#ffffff'; g.fill(); g.globalAlpha /= 0.6;
    rr(g, x - 5, y - 16, 10, 14, 5, col('#8392b4', env));
    return null;
  },
  live(ctx, p, env) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), r = p.w * 25, h = Math.max(24, p.h * 1.5), k = env.t ? Math.sin((env.t / 14000) * Math.PI * 2) : 0, ux = x + k * r * 0.5, th = Math.sqrt(Math.max(0, 1 - (k * 0.5) * (k * 0.5))); ctx.globalAlpha = 0.95; rr(ctx, ux - 2.2, y - 5 - h * th * 0.74, 4.4, h * th * 0.5, 2.2, accOf(p)); ctx.globalAlpha = 1; if (!env.lite && env.night > 0.1) { stampGlow(ctx, '34,217,238', ux, y - 5 - h * th * 0.5, 16, 0.4 * env.night); ctx.globalAlpha = 1; } },
  vary: ['acc'], ext: [29, 6, 31, 16],
});
const accOf = (p) => (p.acc ? lifted(p.acc, 0.6) : TOY.cyan);
shared('dish', {
  body(g, p, env) { const [x, y] = P(p.gx + 0.4, p.gy + 0.4); cast(g, p, p.h * 0.8, env, 0.7); stand(g, x, y + 1, 9, 4); drum(g, x, y + 2, 8, 4, col(PAVE.plaza, env)); post(g, x, y, p.h - 6, 4.2, col('#dfe6f4', env), false); return null; },
  live(ctx, p, env) {
    const [x, y] = P(p.gx + 0.4, p.gy + 0.4), nod = env.t ? Math.sin((env.t / 14000) * Math.PI * 2) * 0.052 : 0, c = col('#fffaf0', env);
    ctx.save(); ctx.translate(x, y - p.h + 3); ctx.rotate(-0.55 + nod);
    disc(ctx, 0, 0, 15, 8.2, shd(c)); disc(ctx, -1, -0.8, 13.4, 7.2, c); disc(ctx, 1.4, 0.6, 9.4, 4.8, mix(c, '#b8c4e0', 0.5)); ctx.globalAlpha *= 0.55; disc(ctx, -5, -3, 4.4, 1.8, '#ffffff'); ctx.globalAlpha /= 0.55;
    bar(ctx, 1, 0, 1, -14, 3, col(METAL.steelMid, env)); ball(ctx, 1, -15.4, 2.8, col(accOf(p), env)); ctx.restore();
  },
  vary: [], ext: [9, 6, 6, 6],
});
shared('windmill', {
  body(g, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [bx, by] = P(cx, cy), [tx, ty] = P(cx, cy, p.h), c = col(lifted(p.col || '#e9e2d0', 0.8), env), cap = col('#c0432a', env);
    stampSoft(g, bx + 10, by + 4, 34, 14, 0.22); stand(g, bx, by + 1, 16, 7);
    g.beginPath(); g.moveTo(bx - 14, by); g.lineTo(tx - 7, ty); g.lineTo(tx + 7, ty); g.lineTo(bx + 14, by); g.ellipse(bx, by, 14, 7, 0, 0, Math.PI, false); g.closePath(); const gr = g.createLinearGradient(bx - 14, 0, bx + 14, 0); gr.addColorStop(0, hi(c, 0.2)); gr.addColorStop(0.5, c); gr.addColorStop(1, shd(c)); g.fillStyle = gr; g.fill();
    for (const k of [0.25, 0.5, 0.75]) { g.beginPath(); g.ellipse(bx + (tx - bx) * k, by + (ty - by) * k, 14 - 7 * k, (14 - 7 * k) / 2, 0, 0.1, Math.PI - 0.1, false); g.strokeStyle = shade(c, 0.9); g.globalAlpha *= 0.5; g.lineWidth = 2; g.stroke(); g.globalAlpha /= 0.5; }
    rr(g, bx - 4, by - 13, 8, 13, 4, col(WOOD.shade, env)); disc(g, tx, ty, 8.6, 4.4, shade(cap, 0.8)); g.beginPath(); g.ellipse(tx, ty, 8.6, 9, 0, Math.PI, 0); g.fillStyle = shd(cap); g.fill(); g.beginPath(); g.ellipse(tx - 0.6, ty - 0.4, 8, 8.4, 0, Math.PI, 0); g.fillStyle = cap; g.fill();
    for (const [dx, cc] of [[-12, BLOOM.pink], [-8, BLOOM.butter], [9, BLOOM.white], [13, BLOOM.pink]]) { ball(g, bx + dx, by + 1, 2.4, col(GRASS.mid, env)); disc(g, bx + dx, by - 1.6, 1.5, 1.5, col(cc, env)); }
    return null;
  },
  live(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [tx, ty] = P(cx, cy, p.h), a0 = env.t ? ((env.t / 9000) % 1) * Math.PI * 2 : 0.52, c = col('#fffaf0', env);
    for (let i = 0; i < 4; i++) { const a = a0 + (i * Math.PI) / 2, ex = tx + Math.cos(a) * 28, ey = ty + 2 + Math.sin(a) * 26; bar(ctx, tx, ty + 2, ex, ey, 3.4, col(WOOD.shade, env)); const nx = -Math.sin(a), ny = Math.cos(a); poly(ctx, [[tx + Math.cos(a) * 7 + nx * 0.5, ty + 2 + Math.sin(a) * 7 + ny * 0.5], [ex + nx * 0.5, ey + ny * 0.5], [ex + nx * 8, ey + ny * 8], [tx + Math.cos(a) * 7 + nx * 8, ty + 2 + Math.sin(a) * 7 + ny * 8]], i % 2 ? c : mix(c, '#f6e6c0', 0.5)); }
    ball(ctx, tx, ty + 2, 3.6, col(WOOD.shade, env));
  },
  vary: ['col'], ext: [6, 6, 6, 6],
});

// ---------------------------------------------------------------- car rows and container stacks
const CARCOL = [TOY.red, TOY.blue, TOY.yellow, '#fffaf0', TOY.green, TOY.violet];
shared('autos', {
  body(g, p, env) {
    const n = p.n, cw = p.w / n;
    for (let i = 0; i < n; i++) {
      const x = p.gx + i * cw + 0.06, ww = cw - 0.12, c = col(CARCOL[(i * 5 + (p.seed | 0)) % CARCOL.length], env), [mx, my] = P(x + ww / 2, p.gy + p.d / 2);
      stampSoft(g, mx + 6, my + 3, ww * 24, 7, 0.2); stand(g, mx, my + 2, ww * 21, 6.5);
      const B = roundedBox(g, x, p.gy + 0.1, ww, p.d - 0.2, 5, c, { z: 2.6, r: 3 }), K = roundedBox(g, x + ww * 0.22, p.gy + 0.15, ww * 0.52, p.d - 0.3, 4.6, shade(c, 0.94), { z: 7.4, r: 2.6, edge: false });
      fq(g, K.left, 0.08, 0.92, 0.22, 0.86, col(GLASS.mid, env)); fq(g, K.right, 0.08, 0.92, 0.22, 0.86, shade(col(GLASS.mid, env), 0.72)); g.globalAlpha *= 0.55; fq(g, K.left, 0.12, 0.3, 0.3, 0.82, '#ffffff'); g.globalAlpha /= 0.55;
      for (const u of [0.2, 0.8]) { const [wx, wy] = facePoint(B.left, u, 0.02); disc(g, wx, wy, 3.1, 3.1, col('#4b4770', env)); disc(g, wx, wy, 1.4, 1.4, col(METAL.steelLight, env)); }
      const [hx, hy] = facePoint(B.left, 0.05, 0.55); disc(g, hx, hy, 1.6, 1.6, col('#fff3c4', env));
      const [fx, fy] = P(x + ww * 0.62, p.gy + p.d * 0.5, 12); bar(g, fx, fy, fx, fy - 6, 1.5, '#8392b4'); rr(g, fx, fy - 8, 5.4, 3.6, 1, col(TOY.pink, env));
    }
    return null;
  }, vary: ['n', 'seed'], ext: [6, 6, 6, 6],
});
const BOXC = [TOY.red, TOY.blue, TOY.orange, TOY.green, TOY.violet, TOY.cyan];
shared('containers', {
  body(g, p, env) {
    const cw = p.w / p.nx, [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2); castShadow(g, p.gx, p.gy, p.w, p.d, p.h, { night: env.night || 0, dusk: 0 }); stand(g, mx, my + 2, p.w * 20, p.d * 11);
    for (let k = 0; k < p.stack; k++) for (let i = 0; i < p.nx; i++) {
      const c = col(BOXC[(i * 3 + k * 2 + (p.seed | 0)) % BOXC.length], env), F = roundedBox(g, p.gx + i * cw + 0.03, p.gy + 0.04, cw - 0.06, p.d - 0.08, 9, c, { z: k * 9.4, r: 2.6 });
      for (let r = 0; r < 9; r++) { const u = 0.1 + r * 0.098; fq(g, F.left, u, u + 0.04, 0.1, 0.9, shade(c, 0.82)); fq(g, F.right, 0.1 + r * 0.098, 0.1 + r * 0.098 + 0.04, 0.1, 0.9, shade(c, 0.7)); }
      fq(g, F.left, 0.0, 0.06, 0.0, 1, col(METAL.steelMid, env)); fq(g, F.left, 0.94, 1.0, 0.0, 1, col(METAL.steelMid, env)); fq(g, F.left, 0.0, 1, 0.0, 0.07, col(METAL.steelMid, env));
    }
    return null;
  }, vary: ['nx', 'stack', 'seed'], ext: [9, 6, 12, 12],
});
