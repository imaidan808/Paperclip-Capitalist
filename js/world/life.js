// The small life of the toy island: the little things that appear beside the props as you come closer (flowerpots, mailboxes, bins, hydrants, paper cups, puddles, pigeons, bushes, flowers, rocks), the gulls that circle
// the open districts, and the sailboats that drift on the sea.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 7.4 (micro-props: hashed from the island, near and close only, never on a road or a pad, each a 6 to 14 world pixel rounded toy with one fill,
// one highlight, one shade and a contact shadow; no litter in a rich district), 5.7 (boats and life on the water) and 8.1 (gulls flap 0.5 s and glide on a 60 s loop; boats bob 5.5 s and rock 1.5 degrees; all of it
// stands still under Calm, Off and reduced motion: a gull perches, a boat lies level).
// Micro-props are the attendants of the props the layout already placed (a lamp, a bench, a tree, a barrel), so none of them can stand where the layout said nothing may: they are drawn live after the prop, as small
// sprites of the variant atlas faded in with the ladder's `near` alpha. The gulls and the boats are drawn by each district's market board (its live part, while the district is in view), so the
// world has no layer for them and nothing needs a hook in the engine.
import { setAttend, blit } from './atlas.js';
import { DIST, LAYOUT } from './layout.js';
import { P, h2, clamp } from './iso.js';
import { GRASS, BLOOM, TOY, ROAD, SEA, WOOD, TILE } from './palette.js';
import { disc, rr, poly, bar, ball, drum, stand, stampSoft, mix, shade, hi, shd, fade } from './toys.js';
import { bush, rock, flowers, reeds, swayOf } from './nature.js';

const RICH = new Set(['estate', 'finance', 'exchange', 'corporate']);
const LITTER = new Set(['scrap', 'pawn', 'market', 'creative', 'harbor', 'industrial']);

// ---------------------------------------------------------------- the little toys (foot at the origin)
const TOYS = {
  flowerpot(g, v) { stampSoft(g, 2, 1, 7, 2.6, 0.2); drum(g, 0, 0, 4.4, 5, TILE.terracotta, { ribs: [0.78], ribCol: TILE.terracottaShade }); disc(g, 0, -5, 3.8, 1.8, '#6a4a34'); ball(g, -2.6, -8, 3, GRASS.mid); ball(g, 2.4, -8, 2.8, GRASS.mid); ball(g, 0, -10, 3.4, GRASS.hi); const b = [BLOOM.pink, BLOOM.butter, BLOOM.white, BLOOM.lilac]; disc(g, -1.4, -12.6, 1.5, 1.5, b[v % 4]); disc(g, 2.2, -10.8, 1.3, 1.3, b[(v + 1) % 4]); },
  mailbox(g) { stampSoft(g, 2, 1, 6, 2.2, 0.2); bar(g, 0, 0, 0, -10, 3.2, ROAD.shade); rr(g, -5, -17, 10, 7, 3, shd(TOY.blue)); rr(g, -5, -17, 9, 6, 3, TOY.blue); rr(g, -3.4, -15.4, 3.4, 1.4, 0.7, hi(TOY.blue, 0.7)); rr(g, 4, -20, 1.6, 6, 0.8, TOY.red); rr(g, 4, -20.4, 4, 2.4, 1, TOY.red); },
  bin(g) { stampSoft(g, 2, 1, 7, 2.6, 0.2); drum(g, 0, 0, 4.6, 9, '#bfe8d4', { ribs: [0.35], ribCol: '#8fc4ae' }); disc(g, 0, -9.4, 5, 2.2, '#8fc4ae'); disc(g, 0, -10, 4.2, 1.8, '#cdeedc'); bar(g, -1.4, -11.4, 1.4, -11.4, 3, '#8fc4ae'); },
  hydrant(g) { stampSoft(g, 2, 1, 6, 2.4, 0.2); drum(g, 0, 0, 3.8, 7, TOY.red, { dome: 3 }); rr(g, -6, -5, 12, 3, 1.5, shade(TOY.red, 0.88)); ball(g, -6, -3.6, 1.9, '#ffd84d'); ball(g, 6, -3.6, 1.9, '#ffd84d'); rr(g, -4.6, 0.6, 9.2, 2, 1, '#8392b4'); },
  cup(g) { stampSoft(g, 1, 0.6, 3.4, 1.4, 0.2); poly(g, [[-2.4, -5], [2.4, -5], [1.6, 0], [-1.6, 0]], '#fffaf0'); poly(g, [[-2.4, -5], [2.4, -5], [2.1, -3], [-2.1, -3]], TOY.red); rr(g, -2.8, -6.2, 5.6, 1.6, 0.8, '#e6e0d0'); bar(g, 0.6, -6.6, 1.4, -9.4, 3, '#ffffff'); },
  puddle(g) { disc(g, 0, 0, 8, 3.4, '#5ec8d6'); disc(g, -0.6, -0.3, 6.6, 2.7, '#7be0cf'); { const alpha0 = fade(g, 0.8); disc(g, -2.6, -0.8, 1.6, 0.8, '#ffffff'); g.globalAlpha = alpha0; } },
  pigeon(g, v) { const c = v % 2 ? '#b6b4d8' : '#c8c4de'; stampSoft(g, 1, 0.4, 4.6, 1.6, 0.18); ball(g, 0, -3.4, 3.6, c); ball(g, v % 3 ? 3 : -3, -6.8, 2.1, mix(c, '#7f7bf0', 0.3)); const d = v % 3 ? 1 : -1; poly(g, [[d * 4.8, -6.8], [d * 7, -6.2], [d * 4.8, -5.4]], TOY.orange); disc(g, d * 3.4, -7.2, 0.55, 0.55, '#2c2a56'); poly(g, [[-d * 3.4, -4.6], [-d * 7, -2.8], [-d * 3, -1.6]], shade(c, 0.84)); bar(g, -1, -0.6, -1, 0.6, 3, '#e8a15a'); bar(g, 1.4, -0.6, 1.4, 0.6, 3, '#e8a15a'); },
  bush(g, v) { bush(g, 0, 0, 7, GRASS.mid, v % 2 ? BLOOM.pink : null); },
  flowers(g, v) { flowers(g, 0, 0, 5, v); },
  rock(g, v) { rock(g, 0, 0, 5 + (v % 3), '#c6bad6'); },
  reeds(g, v) { reeds(g, 0, 0, 18 + (v % 3) * 3, 0, '#7cc65a'); reeds(g, 6, 2, 14 + (v % 2) * 3, 0, '#62b95f'); },
  sign(g) { stampSoft(g, 2, 1, 6, 2.2, 0.2); bar(g, 0, 0, 0, -16, 3.2, ROAD.shade); rr(g, -7, -22, 14, 7, 2.6, '#2f8f62'); rr(g, -7, -22, 12.6, 6, 2.6, '#52cf7c'); poly(g, [[-4, -18.6], [2, -18.6], [2, -20.2], [5, -18.4], [2, -16.6], [2, -18.2], [-4, -18.2]], '#fffaf0'); },
};
const BOX = { flowerpot: [-9, -17, 9, 3], mailbox: [-8, -22, 11, 3], bin: [-8, -14, 8, 3], hydrant: [-9, -12, 9, 3], cup: [-5, -11, 6, 2], puddle: [-10, -5, 10, 5], pigeon: [-9, -11, 9, 3], reeds: [-9, -26, 16, 4], bush: [-14, -22, 14, 4], flowers: [-9, -10, 9, 4], rock: [-12, -12, 12, 4], sign: [-10, -25, 10, 3] };
/** One little toy at (x, y) with `alpha`, as a variant sprite. `v` picks its look (a colour, a way it faces). */
const MICRO = new Map(); // 'name|variant|veil' -> { key, draw }: the name and the drawing closure of one little toy, made once
function micro(ctx, name, x, y, alpha, v, dim, dx = 0) {
  const k = name + '|' + v + '|' + dim; let m = MICRO.get(k); if (!m) MICRO.set(k, m = { key: 'mi|' + k, draw: (g) => TOYS[name](g, v) });
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * alpha; blit(ctx, m.key, BOX[name], m.draw, x, y, dx, 0); ctx.globalAlpha = pa;
}

// ---------------------------------------------------------------- the attendants of a prop
/** What stands beside a prop at near and close zoom, by kind and by its own hash: [name, dx, dy] or null. Pure: the same island every time. */
export function attendantOf(kind, p, theme) {
  const r = h2((p.gx * 29) | 0, (p.gy * 31) | 0), r2 = h2((p.gx * 17) | 0, (p.gy * 13) | 0), rich = RICH.has(theme);
  switch (kind) {
    case 'lamp': return r < 0.28 ? ['flowerpot', -11, 6] : r < 0.4 ? ['pigeon', 0, -37] : r < 0.5 && (theme === 'metro' || theme === 'auto' || theme === 'industrial') ? ['hydrant', 12, 7] : r < 0.58 && !rich ? ['bin', -11, 7] : r < 0.7 && (theme === 'campus' || theme === 'estate' || theme === 'realty' || theme === 'metro') ? ['mailbox', 12, 7] : null;
    case 'bench': return r < 0.38 ? ['pigeon', 8, -19] : r < 0.55 && !rich && theme !== 'campus' ? ['cup', -3, -8] : r > 0.9 && !rich ? ['bin', -20, 6] : null;
    case 'tree': return r < 0.3 ? ['bush', -17, 4] : r < 0.5 ? ['flowers', 15, 4] : r < 0.6 ? ['rock', 14, 5] : null;
    case 'bollard': return theme === 'harbor' ? (r < 0.3 ? ['pigeon', 0, -13] : r < 0.5 ? ['reeds', 12, 5] : null) : null;
    case 'lookout': return ['reeds', -26, 10];
    case 'crates': case 'tires': case 'barrel': return LITTER.has(theme) ? (r < 0.26 ? ['puddle', 16, 8] : r2 < 0.3 ? ['cup', -15, 5] : null) : null;
    case 'planter': return r < 0.25 && !rich ? ['pigeon', 0, -26] : null;
    case 'flag': return r < 0.2 ? ['sign', 14, 5] : null;
    default: return null;
  }
}
const themeOf = (p) => p.theme || (DIST[p.zone] && DIST[p.zone].theme);
/** The hook of atlas.js: called after every shared prop (and tree) is drawn; draws its attendant when the picture is near enough (alpha: the ladder's `near` band). */
const ATT = new WeakMap(); // prop -> { a, x, y, v }: what stands beside a prop, decided once (the island is the same every time)
function attend(ctx, p, env, kind) {
  const d = env.lod ? env.lod.detail[2] : 0; if (d < 0.02 || env.lite) return;
  let m = ATT.get(p);
  if (!m) { const a = attendantOf(kind, p, themeOf(p)), [x, y] = P(p.gx, p.gy); m = { a, x, y, v: (h2((p.gx * 7) | 0, (p.gy * 11) | 0) * 8) | 0 }; ATT.set(p, m); }
  const a = m.a; if (!a) return;
  const x = m.x, y = m.y, v = m.v, dim = Math.round((env.dim || 0) * 8);
  const sway = a[0] === 'reeds' && env.t ? swayOf(env.t, v * 0.7, env.wind) * 1.6 : 0;
  micro(ctx, a[0], x + a[1], y + a[2], d, v, dim, sway);
  if (a[0] === 'reeds' && kind === 'lookout') micro(ctx, 'reeds', x + 30, y + 12, d, v + 1, dim, sway * 0.8); // reeds at both ends of the viewpoint
}
setAttend(attend);

// ---------------------------------------------------------------- the gulls: a few over every open district
const GULLS = 3;
/** Where gull `i` of a district is at time `t` (ms): a lazy ellipse about the district's middle, 50 to 80 s a lap, at a height of 70 to 110. Pure: the same sky every time. */
export function gullAt(D, i, t) {
  const seed = (D.id * 7 + i * 13) | 0, lap = 50000 + h2(seed, 3) * 30000, ph = h2(seed, 5) * Math.PI * 2 + (t / lap) * Math.PI * 2 * (i % 2 ? -1 : 1);
  const rx = 330 + h2(seed, 7) * 170, ry = rx * 0.5, cx = (D.cx - D.cy) * 32, cy = (D.cx + D.cy) * 16 - D.z;
  return { x: cx + Math.cos(ph) * rx, y: cy + Math.sin(ph) * ry - 70 - h2(seed, 9) * 40, ground: cy + Math.sin(ph) * ry, flap: (t / 500 + h2(seed, 11) * 6) * Math.PI * 2, dir: Math.sin(ph) * (i % 2 ? -1 : 1) > 0 ? 1 : -1 };
}
function gull(ctx, x, y, ground, flap, dir, perch) {
  ctx.globalAlpha = 0.18; disc(ctx, x + 6, ground + 4, 5, 1.8, '#4a3f88'); ctx.globalAlpha = 1; // its shadow on the ground
  const w = perch ? 0 : Math.sin(flap) * 4.4;
  bar(ctx, x - 1, y, x - 7, y - 3 - w, 3, '#fffaf0'); bar(ctx, x + 1, y, x + 7, y - 3 - w, 3, '#e6ecf8'); bar(ctx, x - 7, y - 3 - w, x - 11, y - 1 - w * 1.4, 3, '#d4dcee'); bar(ctx, x + 7, y - 3 - w, x + 11, y - 1 - w * 1.4, 3, '#c4ceea');
  disc(ctx, x, y + 0.4, 3.4, 2.5, '#fffaf0'); disc(ctx, x + dir * 3.2, y - 0.8, 1.6, 1.5, '#fffaf0'); poly(ctx, [[x + dir * 4.4, y - 0.8], [x + dir * 6.6, y - 0.2], [x + dir * 4.4, y + 0.2]], TOY.orange);
}

// ---------------------------------------------------------------- the boats: sailboats drifting at hashed places in open water
let SPOTS = null;
/** Open-water places for boats, found once from the island's own land mask: a tile with water for five tiles all round, at least thirty tiles from the nearest other boat. Deterministic. */
export function waterSpots(max = 14) {
  if (SPOTS) return SPOTS;
  const out = [], ok = (x, y) => { if (LAYOUT.isLand(x, y)) return false; for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; if (LAYOUT.isLand(Math.round(x + Math.cos(a) * 5), Math.round(y + Math.sin(a) * 5))) return false; } return true; };
  const b = LAYOUT.bounds, n = 200;
  for (let i = 0; i < n * 3 && out.length < max; i++) {
    const gx = 4 + h2(i, 101) * 190, gy = 4 + h2(i, 103) * 190;
    if (!ok(gx, gy) || out.some(([x, y]) => Math.hypot(x - gx, y - gy) < 30)) continue;
    const sx = (gx - gy) * 32, sy = (gx + gy) * 16;
    if (sx < b.x0 - 1200 || sx > b.x1 + 1200 || sy < b.y0 - 600 || sy > b.y1 + 600) continue; // only the sea about the island
    out.push([gx, gy, i]);
  }
  return (SPOTS = out);
}
function sailboat(ctx, gx, gy, k, env, view) {
  const t = env.t, ph = h2(k, 17) * 6.28, drift = t ? Math.sin(t / 27000 + ph) * 5 : 0, [x0, y0] = P(gx + drift * 0.3, gy - drift * 0.2, 0);
  const bob = t ? Math.sin((t / 5500) * Math.PI * 2 + ph) * 1.2 : 0, rock = t ? Math.sin((t / 5500) * Math.PI * 2 + ph + 1) * 0.026 : 0, sail = k % 2 ? '#fffaf0' : '#ffe8a0', stripe = k % 3 ? TOY.red : TOY.blue;
  ctx.globalAlpha = 0.28; disc(ctx, x0 + 4, y0 + 4, 20, 6, '#1c6fae'); ctx.globalAlpha = 1; // its shadow on the water
  for (let i = 0; i < 2; i++) { const q = t ? ((t / 2400) + i / 2) % 1 : 0.2 + i * 0.4; ctx.globalAlpha = 0.55 * (1 - q); ctx.beginPath(); ctx.ellipse(x0 - 4 - q * 10, y0 + 3 + q * 2.4, 12 + q * 12, 3.6 + q * 4, 0, 0, 6.3); ctx.strokeStyle = '#fbfffe'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.save(); ctx.translate(x0, y0 + bob); ctx.rotate(rock);
  rr(ctx, -15, -3, 30, 8, 4, shd('#fffaf0')); rr(ctx, -15, -3.4, 29, 7, 4, '#fffaf0'); rr(ctx, -15, 0.4, 30, 2.6, 1.2, stripe);
  bar(ctx, 0, -2, 0, -30, 3, '#cc8f50'); poly(ctx, [[1.6, -29], [1.6, -5], [14, -5]], shade(sail, 0.9)); poly(ctx, [[1.6, -29], [1.6, -5], [11, -5]], sail); poly(ctx, [[-1.6, -26], [-1.6, -6], [-10, -6]], hi(sail, 0.3)); poly(ctx, [[0, -30], [6, -28.6], [0, -27.4]], stripe);
  ctx.restore();
}

const BOATS = new Map();
/** The boats each district looks after: every open-water place belongs to the district whose middle is nearest, so the boats are drawn by that district's market board (the one prop every district has, drawn while the district is in view). */
export function boatsOf(id) {
  if (!BOATS.size) { for (const sp of waterSpots()) { let best = null, bd = 1e9; for (const k of LAYOUT.ids) { const D = DIST[k], d = Math.hypot(D.cx - sp[0], D.cy - sp[1]); if (d < bd) { bd = d; best = k; } } if (!BOATS.has(best)) BOATS.set(best, []); BOATS.get(best).push(sp); } }
  return BOATS.get(id) || NO_BOATS;
}
const NO_BOATS = [];
/**
 * The sky and the sea of one district, drawn from its market board's live part: three gulls circling over it (not while it is locked: it sleeps under cloud) and the sailboats that drift in the open water nearest to it.
 * Nothing at far zoom (a gull is a speck there) and nothing in the governor's lite tiers.
 */
export function skyOver(ctx, p, env, zoom = 1) {
  if (env.lite || env.far || env.locked) return;
  const D = DIST[p.zone]; if (!D) return;
  const t = env.t || 0, perch = !env.t;
  for (let i = 0; i < GULLS; i++) { const g = gullAt(D, i, t); gull(ctx, g.x, g.y, g.ground, g.flap, g.dir, perch); }
  const boats = boatsOf(p.zone), view = null; for (let i = 0; i < boats.length; i++) sailboat(ctx, boats[i][0], boats[i][1], boats[i][2], env, view);
}
