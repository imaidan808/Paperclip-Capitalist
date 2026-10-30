// Trees, bushes, hedges, planters, topiary, hay and the small growing things (blossom, fruit, flowers, reeds, rocks) of the toy island, as V2 drawers registered per prop kind (stack.js registerProp).
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.1 (trees: lollipop, puffs of 0.32 to 0.42 of the canopy, a crescent of light and a crescent of shade on every puff, a tapered trunk
// with a rounded foot; pines are three rounded tiers; palms are curved fronds), 4.1 (tree, planter, topiary, hedge, hay, deadtree) and 8.1 (tree sway: 4.2 s, plus and minus 1.2 world pixels at the crown, still under reduced motion).
//
// A tree is two sprites of the variant atlas (atlas.js): the foot (cast shadow, contact patch, trunk) and the crown (every puff), so a wood of two hundred trees is a handful of bitmaps. The crown is blitted a whole
// device pixel at a time, so the sway costs a copy and nothing else. Species follow the district (pines on the campus and the estate, palms on the harbor and in the pawn district, orchard trees on the farm,
// blossom in the creative quarter, round lollipops everywhere else), the size follows the prop's own `s`, and five greens are hashed from the tree's own place so no two neighbours are quite alike.
import { registerProp } from './stack.js';
import { blit, shared, attendOf } from './atlas.js';
import { DIST } from './layout.js';
import { GRASS, BLOOM, WOOD, TILE, PAVE, TOY, LIGHT } from './palette.js';
import { roundedBox, roundedPoly } from './solids.js';
import { P, col, lifted, hi, shd, ball, disc, poly, bar, rr, stand, stampSoft, drum, mix, shade, clamp, rnd, seedOf, vs, vseed, fade } from './toys.js';
import { h2 } from './iso.js';

// ---------------------------------------------------------------- species and variants
const GREENS = ['#7cc65a', '#6cc178', '#8fd68a', '#62b95f', '#9ad064'];
const BY_THEME = { campus: ['pine', 'pine', 'round'], estate: ['pine', 'round', 'pine'], harbor: ['palm', 'round'], pawn: ['palm', 'round', 'round'], farm: ['apple', 'round', 'apple'], creative: ['blossom', 'blossom', 'round'], scrap: ['round'], metro: ['round'], realty: ['round'] };
/** The species of a tree: its district's mix, chosen by the tree's own hash. `p.theme` overrides (tests, the rig). */
export function speciesOf(p) {
  const th = p.theme || (DIST[p.zone] && DIST[p.zone].theme), list = BY_THEME[th] || ['round'];
  return list[((h2((p.gx * 31) | 0, (p.gy * 17) | 0) * 997) | 0) % list.length];
}
const sizeKey = (s) => Math.round(clamp(s, 0.55, 1.5) * 20) / 20;
/** The look of a tree as a name: species, size, one of five greens, the kit's own hue (a touch), the veil. Everything that changes the picture is in it. */
function specOf(p, env) {
  const sp = p.sp || speciesOf(p), s = sizeKey(p.s || 1), v = ((h2((p.gx * 8) | 0, (p.gy * 8) | 0) * 5) | 0) % 5, kit = p.c ? lifted(p.c, 0.5) : GREENS[0];
  let base = GREENS[v]; if (sp !== 'blossom') base = mix(base, kit, 0.16);
  const dq = Math.round((env.dim || 0) * 16), hq = Math.round((env.hz || 0) * 50);
  return { sp, s, v, base: col(base, env), key: `${sp}|${s}|${base}|${dq}|${hq}`, ph: h2((p.gx * 3) | 0, (p.gy * 5) | 0) * 6.283 };
}

// ---------------------------------------------------------------- the foot and the crown
const WOODC = { mid: WOOD.mid, shade: WOOD.shade, light: WOOD.light };
function trunk(g, h, w, c, lean = 0) { // a tapered trunk with a flared, rounded foot, a lit left strip and a cool right one
  const tw = w * 0.74, top = -h;
  poly(g, [[-w * 0.5, 0], [w * 0.5, 0], [tw * 0.5 + lean, top], [-tw * 0.5 + lean, top]], shd(c));
  poly(g, [[-w * 0.5, 0], [w * 0.12, 0], [tw * 0.12 + lean, top], [-tw * 0.5 + lean, top]], c);
  disc(g, -w * 0.38, -0.5, w * 0.34, w * 0.2, c); disc(g, w * 0.38, -0.5, w * 0.34, w * 0.2, shd(c)); // the flare of the roots
  { const alpha0 = fade(g, 0.55); poly(g, [[-w * 0.4, -1], [-w * 0.22, -1], [-tw * 0.22 + lean, top + 2], [-tw * 0.4 + lean, top + 2]], hi(c, 0.75)); g.globalAlpha = alpha0; }
}
function foot(g, sp, s, env, base) {
  const U = 34 * s;
  stampSoft(g, 0.5 * U, 0.1 * U, 0.95 * U, 0.38 * U, 0.2); // the cast shadow, towards the right and down
  stand(g, 0, 0, 0.36 * U, 0.15 * U);
  if (sp === 'pine') trunk(g, 15 * s, 6 * s, col(WOODC.shade, env));
  else if (sp === 'palm') { // a curved trunk: three tapered segments
    const c = col(mix(WOOD.light, WOOD.mid, 0.4), env), seg = [[0, 0, 3 * s, -17 * s, 7 * s], [3 * s, -17 * s, 6 * s, -31 * s, 6 * s], [6 * s, -31 * s, 7 * s, -42 * s, 5 * s]];
    for (const [x0, y0, x1, y1, w] of seg) bar(g, x0, y0, x1, y1, w, shd(c));
    for (const [x0, y0, x1, y1, w] of seg) bar(g, x0 - w * 0.12, y0, x1 - w * 0.12, y1, w * 0.62, c);
    for (let i = 1; i < 6; i++) { const t = i / 6; { const alpha0 = fade(g, 0.4); disc(g, 3 * s + t * 3.5 * s, -42 * s * t, w2(s, t), 0.9, shd(c)); g.globalAlpha = alpha0; } }
  } else trunk(g, 24 * s, 7.2 * s, col(WOODC.shade, env));
}
const w2 = (s, t) => (3.2 - t * 1.2) * s;
function puffs(g, list, U, cy, c, tone, dots) {
  for (const [dx, dy, r, d] of list) {
    const cc = d === 1 ? mix(c, tone || '#3a8f62', 0.34) : d === 2 ? mix(c, '#ffffff', 0.08) : c;
    ball(g, dx * U, cy + dy * U, r * U, cc);
  }
  if (dots) dots(g, U, cy, c, tone);
}
const ROUND = [[-0.27, -0.2, 0.3, 1], [0.28, -0.22, 0.29, 1], [-0.37, 0.02, 0.28, 0], [0.37, 0.04, 0.27, 0], [0.0, -0.31, 0.31, 0], [-0.17, 0.13, 0.31, 2], [0.2, 0.15, 0.3, 2]];
function leafDots(g, U, cy, c) { // little clumps of leaf light inside the front puffs (sub-pixel at a distance, a texture up close)
  const alpha0 = fade(g, 0.5);
  for (let i = 0; i < 9; i++) { const a = h2(i * 13 + 1, 7), b = h2(i * 17 + 3, 11); disc(g, (a - 0.5) * 0.82 * U, cy + (b * 0.5 - 0.22) * U, 0.07 * U, 0.045 * U, hi(c, 0.8)); }
  g.globalAlpha = alpha0;
}
function appleDots(g, U, cy, c) { leafDots(g, U, cy, c); for (let i = 0; i < 6; i++) { const a = h2(i * 29 + 5, 3), b = h2(i * 11 + 9, 5), x = (a - 0.5) * 0.8 * U, y = cy + (b * 0.5 - 0.2) * U; disc(g, x, y, 0.065 * U, 0.065 * U, TOY.red); { const alpha0 = fade(g, 0.7); disc(g, x - 0.02 * U, y - 0.025 * U, 0.022 * U, 0.02 * U, '#fff7dc'); g.globalAlpha = alpha0; } } }
function blossomDots(g, U, cy) { for (let i = 0; i < 10; i++) { const a = h2(i * 19 + 2, 5), b = h2(i * 23 + 1, 9), x = (a - 0.5) * 0.9 * U, y = cy + (b * 0.6 - 0.3) * U; disc(g, x, y, 0.05 * U, 0.05 * U, i % 3 ? BLOOM.white : BLOOM.butter); } }
function crown(g, sp, s, env, base) {
  const U = 34 * s, cy = -(8.4 * s + 0.45 * U);
  if (sp === 'pine') {
    const c = mix(base, '#3a8f62', 0.4), tiers = [[0.62, 0.66, 0.0], [0.5, 0.58, 0.42], [0.36, 0.5, 0.82]];
    for (const [hw, th, up] of tiers) {
      const yb = -(6 * s) - up * U * 0.95, ya = yb - th * U * 1.05, w = hw * U * 1.5, r = 4 * s;
      roundedPoly(g, [[0, ya], [w, yb], [-w, yb]], r * 1.6); g.fillStyle = shd(c); g.fill();
      roundedPoly(g, [[-w * 0.06, ya + 1.5 * s], [w * 0.8 - w * 0.06, yb - 1.4 * s], [-w * 0.86 - w * 0.06, yb - 1.4 * s]], r * 1.5); g.fillStyle = c; g.fill();
      { const alpha0 = fade(g, 0.5); disc(g, -w * 0.2, yb - th * U * 0.42, w * 0.18, th * U * 0.12, hi(c, 0.8)); g.globalAlpha = alpha0; }
    }
  } else if (sp === 'palm') {
    const cx = 7 * s, cyp = -42 * s, c = col(GREENS[1], env), n = 7;
    for (let i = 0; i < n; i++) { // fronds, the back ones first
      const a = -Math.PI * (0.06 + 0.88 * (i / (n - 1))), L = (i === 0 || i === n - 1 ? 21 : i % 2 ? 24 : 27) * s, ex = cx + Math.cos(a) * L, ey = cyp + Math.sin(a) * L * 0.6 + L * 0.32, mx = cx + Math.cos(a) * L * 0.55, my = cyp + Math.sin(a) * L * 0.9 - 3 * s;
      g.beginPath(); g.moveTo(cx, cyp); g.quadraticCurveTo(mx, my - 4.2 * s, ex, ey); g.quadraticCurveTo(mx, my + 3.4 * s, cx, cyp + 1.5 * s); g.closePath(); g.fillStyle = i % 2 ? c : mix(c, '#3a8f62', 0.3); g.fill();
      g.beginPath(); g.moveTo(cx, cyp); g.quadraticCurveTo(mx, my - 4.2 * s, ex, ey); g.quadraticCurveTo(mx, my - 1, cx, cyp - 0.6 * s); g.closePath(); { const alpha0 = fade(g, 0.5); g.fillStyle = hi(c, 0.6); g.fill(); g.globalAlpha = alpha0; }
    }
    ball(g, cx - 2.4 * s, cyp + 3 * s, 2.4 * s, '#9c6238'); ball(g, cx + 2.6 * s, cyp + 3.4 * s, 2.4 * s, '#9c6238');
  } else puffs(g, ROUND, U, cy, sp === 'blossom' ? col(BLOOM.pink, env) : base, sp === 'blossom' ? col(BLOOM.lilac, env) : null, sp === 'apple' ? appleDots : sp === 'blossom' ? blossomDots : leafDots);
}
registerProp('tree', drawTree);
/** One tree painted straight into a surface at (x, y), foot and crown, with no sprite and no sway: the meadows' trees are baked into the ground (groundart.js). `v` picks one of the five greens. */
export function plantTree(g, x, y, sp, s, v) {
  const e = { dim: 0, hz: 0 }, base = col(GREENS[Math.abs(v) % 5], e);
  g.save(); g.translate(x, y); foot(g, sp, s, e, base); crown(g, sp, s, e, base); g.restore();
}
const rectOf = (sp, s, part) => { const U = 34 * s, w = (sp === 'pine' ? 0.62 * 1.5 : sp === 'palm' ? 0.95 : 0.66) * U + 6, top = (sp === 'pine' ? 66 : sp === 'palm' ? 62 : 52) * s; return part === 'foot' ? [-w - 0.3 * U, -(sp === 'palm' ? 46 : 26) * s, w + 1.6 * U, 0.62 * U] : [-w - 6, -top - 8, w + 6 + (sp === 'palm' ? 14 * s : 0), 8]; };

/** The sway of a crown in world pixels: 4.2 s, 1.2 px at the crown, a slow gust over it (docs/ART_DIRECTION.md 8.1); zero when time stands still. */
export const swayOf = (t, ph, wind = 1) => (t ? Math.sin((t / 4200) * Math.PI * 2 + ph) * 1.2 * (0.72 + 0.28 * Math.sin((t / 18000) * Math.PI * 2 + ph * 0.5)) * wind : 0);

const TREE_MEMO = new WeakMap(); // prop -> { sig, spec, kf, kc, rf, rc, df, dc }: a tree's look changes only with the veil, so its names, boxes and drawing closures are made once
function drawTree(ctx, p, env) {
  const sig = Math.round((env.dim || 0) * 16) * 1000 + Math.round((env.hz || 0) * 50);
  let m = TREE_MEMO.get(p);
  if (!m || m.sig !== sig) {
    const sp = specOf(p, env), [x, y] = P(p.gx, p.gy), e = { dim: env.dim, hz: env.hz };
    m = { sig, spec: sp, x, y, kf: 'tf|' + sp.key, kc: 'tc|' + sp.key, rf: rectOf(sp.sp, sp.s, 'foot'), rc: rectOf(sp.sp, sp.s, 'crown'), df: (g) => foot(g, sp.sp, sp.s, e, sp.base), dc: (g) => crown(g, sp.sp, sp.s, e, sp.base) };
    TREE_MEMO.set(p, m);
  }
  blit(ctx, m.kf, m.rf, m.df, m.x, m.y);
  blit(ctx, m.kc, m.rc, m.dc, m.x, m.y, swayOf(env.t, m.spec.ph, env.wind), 0);
  attendOf(ctx, p, env, 'tree');
  return null;
}


// ---------------------------------------------------------------- the dead tree, bush and small growing things
function deadTree(g, env, seed) {
  const c = col('#a47c68', env), lit = col('#cfae98', env);
  stampSoft(g, 8, 2, 20, 7, 0.2); stand(g, 0, 0, 10, 4.5);
  const limbs = [[0, 0, 0, -30, 7.2], [0, -17, -11, -33, 4.6], [0, -23, 10, -39, 4.4], [-8, -28, -15, -33, 3.2], [7, -33, 12, -46, 3.2]];
  for (const [x0, y0, x1, y1, w] of limbs) bar(g, x0, y0, x1, y1, w, shd(c));
  for (const [x0, y0, x1, y1, w] of limbs) bar(g, x0 - w * 0.12, y0, x1 - w * 0.12, y1, w * 0.62, c);
  { const alpha0 = fade(g, 0.6); bar(g, -2.2, -2, -2.2, -26, 2.2, lit); g.globalAlpha = alpha0; }
  for (const [x, y] of [[-14, -35], [13, -48], [11, -40]]) { disc(g, x, y, 3, 2, col(BLOOM.butter, env)); }
  ball(g, 10, -41.4, 2.6, col('#7aa0d8', env)); ball(g, 12.4, -45.6, 2, col('#7aa0d8', env)); poly(g, [[13.8, -46], [16.4, -45], [13.8, -44.4]], col(TOY.orange, env)); disc(g, 12.9, -46.2, 0.55, 0.55, '#2c2a56');
}
shared('deadtree', { body: (g, p, env) => { const [x, y] = P(p.gx, p.gy); g.save(); g.translate(x, y); deadTree(g, env, p); g.restore(); return null; }, vary: [], ext: [6, 13, 6, 6] });

/** A bush: three puffs, optionally with blooms. (x, y) is its foot. Used by the plants of the sprawl and the attendants of the props. */
export function bush(g, x, y, r, c, bloom) {
  stampSoft(g, x + r * 0.5, y + r * 0.1, r * 1.5, r * 0.5, 0.2); const cc = mix(c, '#3a8f62', 0.25);
  ball(g, x - r * 0.62, y - r * 0.55, r * 0.62, cc); ball(g, x + r * 0.62, y - r * 0.5, r * 0.58, cc); ball(g, x, y - r * 0.85, r * 0.72, c);
  if (bloom) for (let i = 0; i < 4; i++) { const a = h2(i + 3, 5), b = h2(i + 8, 2); disc(g, x + (a - 0.5) * r * 1.5, y - r * (0.4 + b * 0.8), r * 0.15, r * 0.15, bloom); }
}
/** A rock: a rounded boulder with a lit top and a cool underside (two flat lenses). */
export function rock(g, x, y, r, c) { stampSoft(g, x + r * 0.4, y + r * 0.1, r * 1.3, r * 0.4, 0.22); disc(g, x, y - r * 0.4, r, r * 0.62, shd(c)); disc(g, x - r * 0.1, y - r * 0.5, r * 0.86, r * 0.5, c); { const alpha0 = fade(g, 0.55); disc(g, x - r * 0.3, y - r * 0.7, r * 0.34, r * 0.16, hi(c, 0.85)); g.globalAlpha = alpha0; } }
/** A reed: three blades and a brown seed head, leaning with `lean` (world pixels at the tip). */
export function reeds(g, x, y, h, lean, c) {
  for (let i = -1; i <= 1; i++) { const hh = h * (1 - Math.abs(i) * 0.18), tx = x + i * 2.6 + lean * (1 + i * 0.2); g.beginPath(); g.moveTo(x + i * 2.2 - 1.2, y); g.quadraticCurveTo(x + i * 2.4 + lean * 0.3, y - hh * 0.6, tx, y - hh); g.quadraticCurveTo(x + i * 2.6 + lean * 0.5, y - hh * 0.5, x + i * 2.2 + 1.2, y); g.closePath(); g.fillStyle = i === 0 ? hi(c, 0.2) : c; g.fill(); }
  bar(g, x + lean, y - h * 0.98, x + lean * 1.05, y - h * 1.12, 3.2, '#9c6238');
}
/** A small flower patch: a few stems' worth of blooms on a green tuft (five petals at close). */
export function flowers(g, x, y, n, seed) {
  const cs = [BLOOM.pink, BLOOM.butter, BLOOM.lilac, BLOOM.white, BLOOM.poppy];
  disc(g, x, y, 5.5, 2.4, GRASS.shade); disc(g, x - 0.8, y - 1.6, 4.6, 2.6, GRASS.mid);
  for (let i = 0; i < n; i++) { const a = h2(seed + i * 5, 3), b = h2(seed + i * 7, 9), fx = x + (a - 0.5) * 8, fy = y - 1.5 - b * 3.4, c = cs[(seed + i) % cs.length]; disc(g, fx, fy, 1.9, 1.9, c); disc(g, fx, fy, 0.7, 0.7, '#ffb347'); }
}

// ---------------------------------------------------------------- planter, topiary, hedge, hay
const STONE = '#f4e8cf';
shared('planter', {
  body(g, p, env) {
    const w = p.w, d = p.d, [x, y] = P(p.gx + w / 2, p.gy + d / 2, 0);
    stampSoft(g, x + 5, y + 4, w * 30, w * 12, 0.2); stand(g, x, y + 2, w * 24, w * 11);
    roundedBox(g, p.gx + w * 0.08, p.gy + d * 0.08, w * 0.84, d * 0.84, 7, col(STONE, env), { r: 3 });
    const [cx, cy] = P(p.gx + w / 2, p.gy + d / 2, 7), r = w * 9.5, c = col(GRASS.mid, env);
    ball(g, cx - r * 0.7, cy - r * 0.3, r * 0.7, mix(c, '#3a8f62', 0.3)); ball(g, cx + r * 0.7, cy - r * 0.26, r * 0.68, mix(c, '#3a8f62', 0.3)); ball(g, cx, cy - r * 0.62, r * 0.82, c); ball(g, cx - r * 0.2, cy - r * 1.18, r * 0.55, hi(c, 0.15));
    const bl = [BLOOM.pink, BLOOM.butter, BLOOM.white, BLOOM.lilac]; for (let i = 0; i < 3; i++) { const a = h2(vs(p) + i, 3); const fx = cx + (a - 0.5) * r * 1.8, fy = cy - r * (0.7 + h2(vs(p) + i * 3, 5) * 0.9); disc(g, fx, fy, 2.2, 2.2, col(bl[(vs(p) + i) % 4], env)); disc(g, fx, fy, 0.8, 0.8, '#ffb347'); }
    return null;
  }, vary: ['#'], ext: [6, 6, 6, 6],
});
shared('topiary', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.25, p.gy + 0.25), v = vseed(p) % 3, c = col(GRASS.shade, env);
    stampSoft(g, x + 5, y + 2, 14, 5, 0.22); stand(g, x, y, 8, 3.6);
    drum(g, x, y, 6.6, 7, col(TILE.terracotta, env), { ribs: [0.8], ribCol: col(TILE.terracottaShade, env) }); disc(g, x, y - 7, 5.6, 2.8, col('#6a4a34', env));
    bar(g, x, y - 6, x, y - 15, 3.4, col(WOOD.shade, env));
    ball(g, x, y - 20, 7.6, c);
    if (v === 1) { g.beginPath(); g.moveTo(x, y - 40); g.arcTo(x + 8, y - 26, x - 8, y - 26, 3); g.arcTo(x - 8, y - 26, x, y - 40, 3); g.arcTo(x, y - 40, x + 8, y - 26, 2.4); g.closePath(); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.moveTo(x - 1, y - 39); g.arcTo(x + 5, y - 26.5, x - 8, y - 26.5, 3); g.arcTo(x - 8, y - 26.5, x - 1, y - 39, 3); g.closePath(); g.fillStyle = c; g.fill(); }
    else { ball(g, x, y - 29, 6.2, c); ball(g, x + 0.4, y - 36, 4.2, hi(c, 0.12)); }
    return null;
  }, vary: ['#'], ext: [6, 6, 6, 6],
});
shared('hedge', {
  body(g, p, env) {
    const along = p.w >= p.d, len = along ? p.w : p.d, c = col(p.col ? mix(GRASS.shade, lifted(p.col, 0.5), 0.2) : GRASS.shade, env), top = Math.max(7, p.h * 0.7);
    const [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2); stampSoft(g, mx + 4, my + 3, len * 17 + 8, len * 7 + 4, 0.2);
    roundedBox(g, p.gx, p.gy, p.w, p.d, top, c, { r: 3 });
    const n = Math.max(3, Math.round(len / 0.3));
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, [x, y] = along ? P(p.gx + p.w * u, p.gy + p.d * 0.55, top) : P(p.gx + p.w * 0.55, p.gy + p.d * u, top); ball(g, x, y - 2.5, 6.4, i % 2 ? mix(c, GRASS.mid, 0.45) : mix(c, GRASS.mid, 0.3)); }
    const bl = [BLOOM.pink, BLOOM.butter, BLOOM.white]; for (let i = 0; i < Math.floor(n / 2); i++) { const u = h2(vs(p) + i, 2) * 0.9 + 0.05, [x, y] = along ? P(p.gx + p.w * u, p.gy + p.d * 0.55, top + 5) : P(p.gx + p.w * 0.55, p.gy + p.d * u, top + 5); disc(g, x, y - 1, 1.9, 1.9, col(bl[i % 3], env)); }
    return null;
  }, vary: ['col', '#'], ext: [6, 6, 6, 6],
});
function castShadowStrip(g, p, h) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2); stampSoft(g, x + h * 0.4, y + 3, (p.w + p.d) * 17 + h * 0.4, (p.w + p.d) * 8 + 3, 0.2); }
shared('hay', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45), c = col('#f1cb62', env), cs = col('#d9a53c', env);
    stampSoft(g, x + 6, y + 2, 20, 7, 0.22); stand(g, x, y + 1, 13, 5.4);
    const bale = (bx, by, R) => { // a round bale lying on its side: a fat drum whose lit end faces the sun, with the spiral of the wrapping on it
      rr(g, bx - R * 1.05, by - R * 1.78, R * 2.1, R * 1.78, R * 0.7, shd(c)); rr(g, bx - R * 1.05, by - R * 1.78, R * 2.1, R * 1.46, R * 0.7, c);
      disc(g, bx - R * 0.78, by - R * 0.92, R * 0.72, R * 0.95, cs); disc(g, bx - R * 0.8, by - R * 0.94, R * 0.64, R * 0.86, hi(c, 0.25));
      for (const k of [0.2, 0.38, 0.56, 0.74]) { g.beginPath(); g.ellipse(bx - R * 0.8, by - R * 0.94, R * 0.64 * k, R * 0.86 * k, 0, 0, 6.3); g.strokeStyle = k > 0.5 ? cs : hi(cs, 0.2); g.lineWidth = 1.5; g.stroke(); }
      { const alpha0 = fade(g, 0.5); rr(g, bx - R * 0.2, by - R * 1.62, R * 1.1, 2.2, 1.1, hi(c, 0.9)); g.globalAlpha = alpha0; }
      g.fillStyle = cs; g.fillRect(bx + R * 0.35, by - R * 1.78, 1.8, R * 1.7);
    };
    bale(x - 3, y - 1, 7); if (vseed(p) % 2 === 0) bale(x + 6, y - 9, 6);
    return null;
  }, vary: ['#'], ext: [6, 6, 6, 6],
});
