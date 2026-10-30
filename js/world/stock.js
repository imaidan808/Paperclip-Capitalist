// Crates: the lots for sale on their pallets and the stock the player holds, as V2 drawers of the `lot` and `asset` layers.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.1 and 4.4: a rounded cube 0.72 of a tile and 17 high in the colour of the asset's first tag (palette.crateColor, light and saturated),
// three filled plank slats and two corner brackets, a stencil mark, a wooden pallet 0.8 of a tile and 4 high under a lot; a broken crate wears cream tape and a crack; an auction lot wears a gold rope loop and a brass bell that
// swings over 4 s; a chosen crate stands in a soft golden pool (radius 22, 0.30, no ring line) and bobs 2.2 s plus and minus 2 world pixels; at close zoom a peeker toy of the tag's family sticks out of the top.
// The crate is one sprite per colour and condition from the variant atlas (atlas.js), blitted where it stands; the hit shapes are the legacy ones, exactly, so nothing about clicking a crate changes.
import { registerLayer } from './stack.js';
import { ASSETS } from '../config.js';
import { zAt } from './layout.js';
import { P, clamp } from './iso.js';
import { CRATE_TAGS, crateColor, WOOD, METAL, TOY, GLASS, GRASS, BLOOM, SEA } from './palette.js';
import { stampGlow } from './gfx.js';
import { money } from './common.js';
import { blit } from './atlas.js';
import { roundedBox } from './solids.js';
import { mix, shade, hi, shd, disc, rr, bar, poly, stand, stampSoft, ball, fq, facePoint, lifted, fade } from './toys.js';

const STEEL = METAL.steelMid, PALLET_H = 4;
/** The colour of a crate of asset class `cls`: its first tag's colour from the palette. */
export const classColor = (cls) => crateColor(ASSETS[cls] && ASSETS[cls].tags[0]);
/** The family of peeker a tag sends up out of the crate (docs/ART_DIRECTION.md 4.4). */
export function peekerOf(tag) {
  if (tag === 'tool') return 'spanner'; if (tag === 'paper' || tag === 'training') return 'book'; if (tag === 'retro' || tag === 'electronics') return 'radio'; if (tag === 'outdoor' || tag === 'vehicle') return 'wheel';
  if (tag === 'fashion') return 'dress'; if (tag === 'gem' || tag === 'luxury') return 'gem'; if (tag === 'farm' || tag === 'food') return 'leaf'; if (tag === 'digital') return 'laptop'; if (tag === 'finance') return 'coins'; if (tag === 'home') return 'lamp';
  return null;
}

// ---------------------------------------------------------------- the crate sprite
/**
 * A wooden crate standing on [gx, gx + w] x [gy, gy + d], `h` high from `z`, in body colour `c`: a rounded cube with three plank slats on each wall, steel corner brackets with rivets and an up arrow stencilled on the lit wall.
 * The one crate of the island: the stock, the lots, the loose stacks of the yards and the pallets of the depots are all this, in other colours. Returns the faces (roundedBox's).
 */
export function plankBox(g, gx, gy, w, d, h, z, c, o = {}) {
  const F = roundedBox(g, gx, gy, w, d, h, c, { z, r: o.r ?? 3.6 });
  for (const [face, k] of [[F.left, 0.78], [F.right, 0.7]]) { // three plank slats: the grooves between them are darker bands, each with a lit lip under it
    for (const v of [0.34, 0.67]) { fq(g, face, 0.07, 0.93, v - 0.028, v + 0.028, shade(c, k)); fq(g, face, 0.07, 0.93, v + 0.034, v + 0.06, mix(c, '#fffbe6', 0.18)); }
  }
  for (const [face, u0, u1] of [[F.left, 0.84, 0.99], [F.right, 0.01, 0.16]]) { fq(g, face, u0, u1, 0.0, 0.2, STEEL); fq(g, face, u0, u1, 0.8, 1.0, STEEL); fq(g, face, u0 + (u1 - u0) * 0.2, u0 + (u1 - u0) * 0.5, 0.04, 0.08, hi(STEEL, 0.7)); }
  if (h >= 10) for (const [x, y] of [facePoint(F.left, 0.915, 0.1), facePoint(F.left, 0.915, 0.9), facePoint(F.right, 0.085, 0.1), facePoint(F.right, 0.085, 0.9)]) disc(g, x, y, 1.1, 1.1, '#fffaf0');
  if (o.arrow !== false && h >= 10) { const A = (u, v) => facePoint(F.left, u, v); { const alpha0 = fade(g, 0.62); poly(g, [A(0.3, 0.45), A(0.5, 0.72), A(0.7, 0.45), A(0.57, 0.45), A(0.57, 0.28), A(0.43, 0.28), A(0.43, 0.45)], '#fffaf0'); g.globalAlpha = alpha0; } }
  return F;
}
function crate(g, c, o) {
  const z0 = o.pallet ? PALLET_H : 0, h = 17, wood = o.wood;
  stampSoft(g, 8, 3, 23, 8.5, 0.2); stand(g, 0, 1.5, 16.5, 7.6);
  if (o.pallet) {
    const F = roundedBox(g, -0.4, -0.4, 0.8, 0.8, PALLET_H, wood, { r: 1.6, edge: false });
    for (const [a, b] of [[0.14, 0.3], [0.45, 0.58], [0.72, 0.86]]) { fq(g, F.left, a, b, 0.0, 0.62, shade(wood, 0.62)); fq(g, F.right, a, b, 0.0, 0.62, shade(wood, 0.5)); }
  }
  const F = plankBox(g, -0.36, -0.36, 0.72, 0.72, h, z0, c), A = (u, v) => facePoint(F.left, u, v);
  if (o.broken) { // cream tape over the cracked side and a crack across it
    const t = (u0, v0, u1, v1, w) => poly(g, [A(u0 - w, v0), A(u0 + w, v0), A(u1 + w, v1), A(u1 - w, v1)], '#fff3d6');
    t(0.1, 0.12, 0.9, 0.88, 0.07); t(0.1, 0.88, 0.9, 0.12, 0.07);
    poly(g, [A(0.2, 0.9), A(0.32, 0.62), A(0.28, 0.5), A(0.46, 0.3), A(0.5, 0.34), A(0.34, 0.52), A(0.38, 0.64), A(0.26, 0.92)], '#4a3f78');
  }
  return F;
}
const rectCrate = [-30, -46, 36, 14];
function crateAt(ctx, key, c, o, x, y, dy = 0) { return blit(ctx, key, rectCrate, (g) => crate(g, c, o), x, y, 0, dy); }

// ---------------------------------------------------------------- peekers
function peeker(g, kind, x, y, c) {
  g.save(); g.translate(x, y);
  if (kind === 'spanner') { bar(g, 0, 0, 3, -9, 3, STEEL); disc(g, 3.6, -10.4, 3.4, 3.2, '#b2bed8'); disc(g, 3.6, -11.4, 1.4, 1.4, c); bar(g, -2.6, 0, -2.2, -3, 3, shade(STEEL, 0.9)); }
  else if (kind === 'book') { rr(g, -5, -7, 10, 7, 1.6, '#4aa0f0'); rr(g, -5, -7, 10, 5.4, 1.6, '#7bc0ff'); rr(g, -3.8, -5, 7.6, 1.4, 0.7, '#fffaf0'); rr(g, -3.6, -9.4, 7.8, 2.8, 1, '#ff6a55'); }
  else if (kind === 'radio') { rr(g, -5.4, -8, 10.8, 8, 2.4, '#ff9a3a'); rr(g, -4.6, -7.2, 9.2, 6, 2, '#ffb866'); disc(g, -2, -4, 2, 2, '#fff7dc'); disc(g, 2.6, -3.6, 1.2, 1.2, '#5a4a8c'); bar(g, 3.6, -8, 6, -12.4, 3, '#dfe6f4'); }
  else if (kind === 'wheel') { g.beginPath(); g.ellipse(0, -5.4, 5.4, 5.4, 0, 0, 6.3); g.strokeStyle = '#3d3a5c'; g.lineWidth = 2.4; g.stroke(); g.beginPath(); g.moveTo(-5, -5.4); g.lineTo(5, -5.4); g.moveTo(0, -10.4); g.lineTo(0, -0.4); g.strokeStyle = '#dfe6f4'; g.lineWidth = 1.5; g.stroke(); disc(g, 0, -5.4, 1.2, 1.2, '#ff5f4e'); }
  else if (kind === 'dress') { poly(g, [[-1.6, -11], [1.6, -11], [2.6, -6], [6, 0], [-6, 0], [-2.6, -6]], '#ff7fb8'); poly(g, [[-1.6, -11], [0, -11], [-0.6, -6], [-3.8, 0], [-6, 0], [-2.6, -6]], '#ff9cc2'); rr(g, -2.8, -6.4, 5.6, 1.4, 0.7, '#fffbe8'); }
  else if (kind === 'gem') { poly(g, [[-4.4, -6], [-2.4, -9.6], [2.4, -9.6], [4.4, -6], [0, 0]], '#78eed8'); poly(g, [[-4.4, -6], [4.4, -6], [0, 0]], '#43c8d0'); poly(g, [[-2.4, -9.6], [0, -6], [-4.4, -6]], '#c8fff0'); }
  else if (kind === 'leaf') for (const [dx, a, k] of [[-3, -0.5, 1], [0, 0, 1.25], [3, 0.5, 1]]) { g.save(); g.translate(dx, 0); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-3.4, -5 * k, 0, -10 * k); g.quadraticCurveTo(3.4, -5 * k, 0, 0); g.fillStyle = GRASS.mid; g.fill(); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-3.4, -5 * k, 0, -10 * k); g.quadraticCurveTo(-1, -5 * k, 0, 0); g.fillStyle = GRASS.hi; g.fill(); g.restore(); }
  else if (kind === 'laptop') { rr(g, -5, -3.4, 10, 3.4, 1.2, '#b2bed8'); rr(g, -4, -9.4, 8, 6.4, 1.2, '#3a4a6a'); rr(g, -3.2, -8.6, 6.4, 4.8, 0.8, '#8ae8ff'); }
  else if (kind === 'coins') { ball(g, 0, -4, 4.8, '#f2c94c'); rr(g, -2.4, -9.2, 4.8, 2.4, 1.2, '#d9a52c'); disc(g, 0, -4, 1.7, 1.7, '#d9a52c'); }
  else if (kind === 'lamp') { poly(g, [[-3.4, -6], [3.4, -6], [5, -11], [-5, -11]], '#ffe08a'); rr(g, -0.8, -6, 1.6, 4, 0.8, '#cc8f50'); disc(g, 0, -1.6, 3.2, 1.3, '#cc8f50'); }
  else ball(g, 0, -4, 4, c);
  g.restore();
}

// ---------------------------------------------------------------- the lot layer
function drawLotV2(ctx, view, env, w, e) {
  const [gx, gy] = w.posOf(e), z = zAt(gx, gy), l = e.lot, [x, y0] = P(gx, gy, z), y = y0 - e.drop, c0 = classColor(l.cls), hov = w.hover && w.hover.eid === e.id, auction = l.mode === 'auction', t = env.t;
  const lift = (hov ? 2.5 : 0) + (auction && t ? Math.sin(t / 700 + gx * 3) * 0.9 : 0), broken = l.cond === 'broken', dq = Math.round((env.dim || 0) * 16);
  const c = broken ? mix(c0, '#d8cfc0', 0.22) : c0;
  ctx.save(); ctx.translate(0, -e.drop);
  crateAt(ctx, `lot|${c}|${broken ? 1 : 0}|${dq}`, c, { pallet: true, wood: WOOD.mid, broken }, x, y0 - 0 + 0, -lift);
  if (auction) { const k = t ? Math.sin((t / 4000) * Math.PI * 2 + gx) : 0, bx = x - 7 + k * 1.6, by = y0 - 29 - lift; // a gold rope loop and a brass bell
    ctx.strokeStyle = '#f6c94f'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y0 - 20 - lift, 12, 6, 0, 0, 6.3); ctx.stroke(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 7, y0 - 22.5 - lift); ctx.lineTo(bx, by); ctx.stroke(); ctx.lineCap = 'butt';
    ball(ctx, bx, by - 1.4, 2.8, '#f6c94f'); disc(ctx, bx, by + 1.3, 2.4, 1, '#d9a52c'); disc(ctx, bx, by + 2.2, 0.8, 0.8, '#7a4a1c'); }
  const lod = env.lod && env.lod.detail[3];
  if (lod > 0.02 && !broken) { const kind = peekerOf(ASSETS[l.cls] && ASSETS[l.cls].tags[0]); if (kind) { ctx.globalAlpha = lod; peeker(ctx, kind, x + 1, y0 - 22 - lift, c0); ctx.globalAlpha = 1; } }
  ctx.restore();
  w.hits.push({ eid: e.id, kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `${ASSETS[l.cls].name}${l.cond === 'broken' ? ' (broken)' : ''}${auction ? ' at auction' : ' for sale'}`, polys: [[[x - 18, y - 26], [x + 18, y - 26], [x + 18, y + 4], [x - 18, y + 4]]], lot: l });
  if (w.cam.z > 0.5) w.overlay.push({ k: 'tag', n: 6, wx: x, wy: y - 32, draw: (g, px, py, s) => w.tag(g, px, py, s, auction ? '🔨' : ASSETS[l.cls].icon, money(l.price), auction ? '#ffd36e' : '#46e38e', hov) });
}
registerLayer('lot', drawLotV2, 'inherit');

// ---------------------------------------------------------------- the stock layer
function drawAssetV2(ctx, view, env, w, e) {
  const [gx, gy] = w.posOf(e), z = zAt(gx, gy), a = e.asset, [x, y0] = P(gx, gy, z), y = y0 - e.drop, t = env.t;
  const sel = w.api.ui.sel.has(a.id), c0 = classColor(a.cls), hov = w.hover && w.hover.eid === e.id, bob = sel && t ? Math.sin((t / 2200) * Math.PI * 2) * 2 : 0, broken = a.cond === 'broken';
  const wear = clamp(a.wear, 0.4, 1), c = mix(broken ? mix(c0, '#d8cfc0', 0.22) : c0, '#d8cfc0', (1 - wear) * 0.3), dq = Math.round((env.dim || 0) * 16);
  ctx.save(); ctx.translate(0, -e.drop);
  if (sel) { // a soft pool of gold light under the chosen crate: two flat discs and a stamped glow, never a ring line
    const k = t ? 0.5 + 0.5 * Math.sin((t / 2200) * Math.PI * 2) : 0.5;
    ctx.globalAlpha = 0.3 + 0.08 * k; disc(ctx, x, y0 + 1, 22 + 1.5 * k, 11 + 0.8 * k, '#ffd36e'); ctx.globalAlpha = 0.4; disc(ctx, x, y0 + 1, 14, 7, '#fff2bd'); ctx.globalAlpha = 1;
  }
  crateAt(ctx, `ast|${c}|${broken ? 1 : 0}|${dq}`, c, { pallet: false, wood: WOOD.mid, broken }, x, y0, -bob - (hov ? 2 : 0));
  if (broken && t && !env.far) for (let i = 0; i < 2; i++) { const k = ((t / 900) + i / 2) % 1; ctx.globalAlpha = 0.4 * (1 - k); disc(ctx, x + k * 6, y0 - 20 - k * 16 - bob, 2 + k * 3.6, 2 + k * 3.6, '#f0f4ff'); ctx.globalAlpha = 1; }
  const lod = env.lod && env.lod.detail[3];
  if (lod > 0.02 && !broken) { const kind = peekerOf(ASSETS[a.cls] && ASSETS[a.cls].tags[0]); if (kind) { ctx.globalAlpha = lod; peeker(ctx, kind, x + 1, y0 - 19 - bob, c0); ctx.globalAlpha = 1; } }
  ctx.restore();
  w.hits.push({ eid: e.id, kind: 'asset', id: a.id, zone: e.zone, label: `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}, in your stock`, polys: [[[x - 16, y - 32 - bob], [x + 16, y - 32 - bob], [x + 16, y + 4], [x - 16, y + 4]]], asset: a });
  if (w.cam.z > 0.6 || sel || hov) w.overlay.push({ k: 'icon', n: 0, wx: x, wy: y - 36 - bob, draw: (g, px, py, s) => w.icon(g, px, py, s, ASSETS[a.cls].icon, sel) });
}
registerLayer('asset', drawAssetV2, 'inherit');
