// The materials of a district's block, one treatment each: dirt plaza with tone patches and pebbles, asphalt with worn edges, patches and cracks, sidewalk of bevelled pavers, raised kerbs with a face and a
// shadow, a plinth under the whole stage, a slab for the stash. Nothing here is a speckle laid over everything (the first V2 ground had one 64 x 64 pattern over plaza, road and walk alike: at the finest
// zoom it was soft three-pixel blocks, the same on every material). Docs/ART_DIRECTION.md 4.5 and 5.9; the judges' E1, E2, E5 and E6 of the first round.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Every mark is a filled shape, hashed from the grid (so it is where it is whatever chunk draws it), faded in by the level of detail, and baked into
// the ground chunk: a pan draws none of it. The pure parts (the kerbs' geometry, the crack's outline, the tile range of a view) are tested in tests/world-groundmat.test.mjs.
import { h2, mix, shade, clamp } from './iso.js';
import { ROAD, PAVE, LIGHT, INK, GRASS, faceTone } from './palette.js';
import { VEIL } from './terrainfield.js';
import { warmVeil } from './decalart.js';

const HW = 32, HH = 16, TAU = 6.2832;
const px = (gx, gy) => (gx - gy) * HW, py = (gx, gy, z) => (gx + gy) * HH - z;
/** The kerb bar's width (tiles) and height (world pixels), the plinth's height under the stage, and the kerb's share of a tile. */
export const KERB_W = 0.22, KERB_H = 2.2, PLINTH_H = 2.6;

// ---------------------------------------------------------------- pure: geometry
/**
 * The tiles a world rectangle can touch, as [i0, i1, j0, j1] (grid columns and rows, inclusive): the four corners at the ground and `zTop` pixels above it, `pad` tiles of margin. Both ranges are clamped to
 * `lim` ([gw, gh]) when given. A mark loop walks these tiles and nothing else, so what a chunk bakes costs what the chunk shows.
 */
export function gridRange(view, zTop = 0, pad = 1, lim = null) {
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) for (const zz of [0, zTop]) { const a = x / 64 + (y + zz) / 32, b = (y + zz) / 32 - x / 64; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
  const o = [Math.floor(a0) - pad, Math.ceil(a1) + pad, Math.floor(b0) - pad, Math.ceil(b1) + pad];
  if (lim) { o[0] = Math.max(0, o[0]); o[2] = Math.max(0, o[2]); o[1] = Math.min(lim[0] - 1, o[1]); o[3] = Math.min(lim[1] - 1, o[3]); }
  return o;
}
/**
 * The raised kerbs of a block's streets: for each road rectangle { x, y, w, d } (an east-west road is wider than it is deep), a bar of `KERB_W` tiles on each side, interrupted where a street crosses it. The east-west
 * bars run through the corner (up to the cross street's own edge) and the north-south ones stop where those begin, so no two bars overlap. `face` is the side whose wall the viewer sees: 'l' for the wall that
 * looks towards +gy (the sun side, along gx), 'r' for the one that looks towards +gx (the shade side, along gy). Every bar lies OUTSIDE its road's rectangle, on the pavement.
 */
export function kerbBars(roads, kb = KERB_W) {
  const hs = roads.filter((r) => r.w > r.d), vs = roads.filter((r) => r.w <= r.d), out = [];
  for (const r of hs) {
    const cuts = vs.filter((v) => v.x < r.x + r.w && v.x + v.w > r.x && v.y < r.y + r.d && v.y + v.d > r.y).sort((a, b) => a.x - b.x);
    let x = r.x; const runs = [];
    for (const v of cuts) { if (v.x > x) runs.push([x, v.x]); x = Math.max(x, v.x + v.w); }
    if (x < r.x + r.w) runs.push([x, r.x + r.w]);
    for (const [a, b] of runs) { out.push({ x: a, y: r.y - kb, w: b - a, d: kb, face: 'l' }); out.push({ x: a, y: r.y + r.d, w: b - a, d: kb, face: 'l' }); }
  }
  for (const v of vs) {
    const cuts = hs.filter((r) => v.x < r.x + r.w && v.x + v.w > r.x && v.y < r.y + r.d && v.y + v.d > r.y).sort((a, b) => a.y - b.y);
    let y = v.y; const runs = [];
    for (const r of cuts) { if (r.y - kb > y) runs.push([y, r.y - kb]); y = Math.max(y, r.y + r.d + kb); }
    if (y < v.y + v.d) runs.push([y, v.y + v.d]);
    for (const [a, b] of runs) { out.push({ x: v.x - kb, y: a, w: kb, d: b - a, face: 'r' }); out.push({ x: v.x + v.w, y: a, w: kb, d: b - a, face: 'r' }); }
  }
  return out;
}
/**
 * A crack as a closed outline in a local frame (u along the crack, v across it, both in tiles): a jagged line of `n` bends that is thickest at its middle and tapers to a point at both ends, at least
 * `minW` wide where it is thickest (a filled shape, never a hairline). Deterministic in `seed`. Answers [[u, v], ...] going out along one side and back along the other.
 */
export function crackOutline(seed, len = 1.2, n = 5, minW = 0.05) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = len * t, bend = (h2(seed * 7 + i, 11) - 0.5) * 0.28 * (i === 0 || i === n ? 0.4 : 1), w = minW * Math.sin(Math.PI * t) ** 0.8 + 0.004;
    top.push([u, bend - w / 2]); bot.push([u, bend + w / 2]);
  }
  return top.concat(bot.reverse());
}

// ---------------------------------------------------------------- the district's tones
const TONES = new Map();
/** Every colour a block is painted in, from the district's daylight set and its veil (k): one record per district and veil step, made once. */
export function tonesOf(D, S, k) {
  const key = D.id + '|' + k; let t = TONES.get(key); if (t) return t;
  const v = (c) => (k ? warmVeil(c, k * VEIL) : c), g = S.ground, ft = faceTone(v(g)), kt = faceTone(v(ROAD.kerb));
  t = {
    ground: v(g), rim: v(mix(g, '#fff6df', 0.34)), faceL: ft.l, faceR: ft.r, patchLo: v(mix(g, '#c98f55', 0.3)), patchHi: v(mix(g, '#fff8e6', 0.42)), pebLo: v(mix(g, '#a8774a', 0.5)), pebHi: v(mix(g, '#fffbe9', 0.62)),
    tuft: [v(GRASS.hi), v(GRASS.shade), v(GRASS.mid)],
    walk: v(S.walk), walkHi: v(mix(S.walk, '#ffffff', 0.6)), walkLo: v(mix(S.walk, '#b79f78', 0.26)), joint: v(mix(S.walk, '#a58d6a', 0.34)),
    asph: v(S.asphalt), asphLo: v(mix(S.asphalt, ROAD.deep, 0.6)), asphHi: v(mix(S.asphalt, ROAD.hi, 0.55)), crack: v(mix(S.asphalt, INK.darkest, 0.5)), seam: v(mix(S.asphalt, ROAD.light, 0.6)),
    kerbTop: v(ROAD.kerb), kerbL: kt.l, kerbR: kt.r, dash: v(ROAD.dash), zebra: v(ROAD.zebra), manhole: v(ROAD.manhole), manholeHi: v(ROAD.light),
    pad: v(mix(g, '#f6eedb', 0.34)), padRim: v(mix(g, '#fff8e8', 0.62)), padEdge: v(mix(g, '#a98a66', 0.42)), shadow: LIGHT.shadow,
  };
  if (TONES.size > 400) TONES.clear(); TONES.set(key, t); return t;
}
export const releaseTones = () => TONES.clear();

// ---------------------------------------------------------------- shapes in the ground plane
function rrect(ctx, x, y, w, d, r, z, seg = 5) {
  r = Math.min(r, w / 2, d / 2); ctx.moveTo(px(x + r, y), py(x + r, y, z));
  const arc = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2), gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; ctx.lineTo(px(gx, gy), py(gx, gy, z)); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + d - r, 0); arc(x + r, y + d - r, Math.PI / 2); arc(x + r, y + r, Math.PI); ctx.closePath();
}
const fillRR = (ctx, x, y, w, d, r, z, c, a = 1, seg = 5) => { ctx.beginPath(); rrect(ctx, x, y, w, d, r, z, seg); ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; };
const quadAt = (ctx, x, y, w, d, z) => { ctx.moveTo(px(x, y), py(x, y, z)); ctx.lineTo(px(x + w, y), py(x + w, y, z)); ctx.lineTo(px(x + w, y + d), py(x + w, y + d, z)); ctx.lineTo(px(x, y + d), py(x, y + d, z)); ctx.closePath(); };
const fillQ = (ctx, x, y, w, d, z, c, a = 1) => { ctx.beginPath(); quadAt(ctx, x, y, w, d, z); ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; };
const disc = (ctx, gx, gy, z, rx, ry) => { ctx.moveTo(px(gx, gy) + rx, py(gx, gy, z)); ctx.ellipse(px(gx, gy), py(gx, gy, z), rx, ry, 0, 0, TAU); };
const seen = (view, x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1;
const inRect = (r, gx, gy) => gx > r.x && gx < r.x + r.w && gy > r.y && gy < r.y + r.d;

/** A tuft of three leaning blades standing at (x, y), `hgt` pixels tall: the same shape wherever grass is drawn into the ground. */
export function tuft(ctx, x, y, hh, hgt = 5 + hh * 3.4) {
  for (let bl = -1; bl <= 1; bl++) { const bx = x + bl * 1.7, lean = bl * 1.5 + (hh - 0.5) * 2; ctx.moveTo(bx - 0.95, y); ctx.lineTo(bx + lean, y - hgt * (bl === 0 ? 1 : 0.78)); ctx.lineTo(bx + 0.95, y); ctx.closePath(); }
}

/** The world rectangle [x0, y0, x1, y1] a kit's decal can reach at height z (a round one by its radius, a rectangular one by its four corners), with a margin for the soft edge: what the chunk's view is tested against. */
export function decalBox(d, z) {
  if (d.r && d.w === undefined) { const x = px(d.x, d.y), y = py(d.x, d.y, z), rx = d.r * HW * 1.7 + 4, ry = d.r * HH * 1.7 + 4; return [x - rx, y - ry, x + rx, y + ry]; }
  const w = d.w ?? 0, dd = d.d ?? 0, xs = [px(d.x, d.y + dd), px(d.x + w, d.y)], ys = [py(d.x, d.y, z), py(d.x + w, d.y + dd, z)];
  return [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
}

// ---------------------------------------------------------------- the stage
/** One raised bar (a kerb): its wall in `face`, then its top `h` pixels higher. */
function bar(ctx, b, z, top, face) { fillQ(ctx, b.x, b.y, b.w, b.d, z, face); fillQ(ctx, b.x, b.y, b.w, b.d, z + KERB_H, top); }

/**
 * Paint a district's block: the stage (soft shadow, plinth, rim), the dirt plaza, the sidewalk, the two streets and their kerbs, the stash slab, the district's decals and the manholes. `view` is the chunk's
 * world rectangle, `detail` the level-of-detail alphas ([1, mid, near, close]), `decal(ctx, d)` draws one of the kit's decals. Everything is clipped by the canvas to the chunk, and marks that cannot reach the view are
 * skipped before they are built.
 */
export function drawStage(ctx, view, D, S, k, detail, decal, zoom) {
  const T = tonesOf(D, S, k), z = D.z, ox = D.ox, oy = D.oy, BW = D.w, BD = D.d, mid = detail[1], near = detail[2], close = detail[3], id = D.id | 0;
  const walks = D.ground.filter((g) => g.kind === 'walk'), roads = D.ground.filter((g) => g.kind === 'road'), pads = D.ground.filter((g) => g.kind === 'pad');
  // ---- the stage: a soft shadow towards +gx and +gy (many faint steps, so no band shows), the plinth's two walls, a cream rim and the ground inside it
  const steps = mid > 0.05 ? 8 : 3, sa = 0.15 / steps; // eight faint steps from the mid zoom (no band shows), three where the stage is a few pixels across
  for (let i = steps; i >= 1; i--) { const f = 9 / steps * i; fillRR(ctx, ox - 0.3 - f * 0.03, oy - 0.3 - f * 0.03, BW + 0.6 + f * 0.2, BD + 0.6 + f * 0.2, 1.4 + f * 0.12, z - PLINTH_H, T.shadow, sa, 3); }
  const split = px(ox + BW, oy + BD), band = view.y1 - view.y0 + 600;
  ctx.save(); ctx.beginPath(); ctx.rect(view.x0 - 4, view.y0 - 300, split - view.x0 + 4, band); ctx.clip(); ctx.fillStyle = T.faceL; ctx.beginPath(); rrect(ctx, ox, oy, BW, BD, 0.9, z - PLINTH_H); ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(split, view.y0 - 300, view.x1 - split + 4, band); ctx.clip(); ctx.fillStyle = T.faceR; ctx.beginPath(); rrect(ctx, ox, oy, BW, BD, 0.9, z - PLINTH_H); ctx.fill(); ctx.restore();
  fillRR(ctx, ox, oy, BW, BD, 0.9, z, T.rim); fillRR(ctx, ox + 0.28, oy + 0.28, BW - 0.56, BD - 0.56, 0.7, z, T.ground);
  // ---- the plaza: broad patches of lighter and darker dirt, then (near) pebbles
  ctx.save(); ctx.beginPath(); rrect(ctx, ox + 0.28, oy + 0.28, BW - 0.56, BD - 0.56, 0.7, z); ctx.clip();
  for (let n = 0; n < (mid > 0.05 ? 24 : 0); n++) {
    const gx = ox + 1 + h2(id * 31 + n, 3) * (BW - 2), gy = oy + 1 + h2(id * 37 + n, 5) * (BD - 2), r = 1.1 + h2(id * 41 + n, 7) * 2.6, rx = r * HW * 1.42, ry = r * HH * 1.42, x = px(gx, gy), y = py(gx, gy, z);
    if (!seen(view, x - rx, y - ry, x + rx, y + ry)) continue;
    ctx.fillStyle = n % 2 ? T.patchHi : T.patchLo; ctx.globalAlpha = 0.2 * Math.min(1, mid * 1.5); ctx.beginPath(); disc(ctx, gx, gy, z, rx, ry); disc(ctx, gx + r * 0.35, gy - r * 0.2, z, rx * 0.7, ry * 0.7); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
  // ---- sidewalk
  for (const g of walks) fillQ(ctx, g.x, g.y, g.w, g.d, z, T.walk);
  if (near > 0.05) paintPavers(ctx, view, id, walks, roads, z, T, near, close);
  // ---- the streets
  for (const r of roads) fillQ(ctx, r.x, r.y, r.w, r.d, z, T.asph);
  if (mid > 0.05 && seen(view, D.bb[0], D.bb[1], D.bb[2], D.bb[3] + 200)) paintAsphalt(ctx, view, id, roads, z, T, mid, close);
  // ---- the centre dashes and the crossing's bars (painted bands, 0.2 tile at the least)
  ctx.fillStyle = T.dash; ctx.beginPath();
  for (let x = ox + 0.4; x < ox + BW - 1; x += 1.7) { if (x > ox + 8.2 && x < ox + 13.4) continue; ctx.moveTo(px(x, oy + 8.88), py(x, oy + 8.88, z)); ctx.lineTo(px(x + 0.9, oy + 8.88), py(x + 0.9, oy + 8.88, z)); ctx.lineTo(px(x + 0.9, oy + 9.12), py(x + 0.9, oy + 9.12, z)); ctx.lineTo(px(x, oy + 9.12), py(x, oy + 9.12, z)); ctx.closePath(); }
  for (let y = oy + 0.4; y < oy + BD - 0.6; y += 1.7) { if (y > oy + 6.4 && y < oy + 11.6) continue; ctx.moveTo(px(ox + 10.88, y), py(ox + 10.88, y, z)); ctx.lineTo(px(ox + 11.12, y), py(ox + 11.12, y, z)); ctx.lineTo(px(ox + 11.12, y + 0.9), py(ox + 11.12, y + 0.9, z)); ctx.lineTo(px(ox + 10.88, y + 0.9), py(ox + 10.88, y + 0.9, z)); ctx.closePath(); }
  ctx.fill();
  ctx.fillStyle = T.zebra; ctx.beginPath();
  for (let q = 0; q < 5; q++) {
    const u = 0.28 + q * 0.34;
    for (const x of [ox + 8.3, ox + 13.1]) { ctx.moveTo(px(x, oy + 8 + u - 0.1), py(x, oy + 8 + u - 0.1, z)); ctx.lineTo(px(x + 0.6, oy + 8 + u - 0.1), py(x + 0.6, oy + 8 + u - 0.1, z)); ctx.lineTo(px(x + 0.6, oy + 8 + u + 0.1), py(x + 0.6, oy + 8 + u + 0.1, z)); ctx.lineTo(px(x, oy + 8 + u + 0.1), py(x, oy + 8 + u + 0.1, z)); ctx.closePath(); }
    for (const y of [oy + 6.4, oy + 11.1]) { ctx.moveTo(px(ox + 10.2 + u - 0.1, y), py(ox + 10.2 + u - 0.1, y, z)); ctx.lineTo(px(ox + 10.2 + u + 0.1, y), py(ox + 10.2 + u + 0.1, y, z)); ctx.lineTo(px(ox + 10.2 + u + 0.1, y + 0.6), py(ox + 10.2 + u + 0.1, y + 0.6, z)); ctx.lineTo(px(ox + 10.2 + u - 0.1, y + 0.6), py(ox + 10.2 + u - 0.1, y + 0.6, z)); ctx.closePath(); }
  }
  ctx.fill();
  // ---- the kerbs: raised bars along both sides of both streets (wall, then top)
  for (const b of kerbBars(roads)) { if (!seen(view, px(b.x, b.y + b.d), py(b.x, b.y, z) - 4, px(b.x + b.w, b.y), py(b.x + b.w, b.y + b.d, z) + 4)) continue; bar(ctx, b, z, T.kerbTop, b.face === 'l' ? T.kerbL : T.kerbR); }
  // ---- the stash slab: a light concrete pad with a bright rim and a darker lip, so it reads as laid down and not as a shadow
  for (const g of pads) { fillRR(ctx, g.x - 0.08, g.y - 0.08, g.w + 0.16, g.d + 0.16, 0.5, z, T.padEdge, 0.55); fillRR(ctx, g.x, g.y, g.w, g.d, 0.45, z, T.padRim); fillRR(ctx, g.x + 0.16, g.y + 0.16, g.w - 0.32, g.d - 0.32, 0.34, z, T.pad); }
  // ---- the kit's decals and the manholes
  const flat = walks.concat(roads, pads), onFlat = (d) => { const m = d.r * 0.5; for (const g of flat) if (d.x > g.x - m && d.x < g.x + g.w + m && d.y > g.y - m && d.y < g.y + g.d + m) return true; return false; };
  for (const d of D.decals) if (zoom >= (d.min ?? 0.3) && seen(view, ...decalBox(d, z)) && !(d.k === 'ell' && onFlat(d))) decal(ctx, d); // only the decals the chunk can see; a puddle or a stain lies on the dirt, never across a street, a pavement or the stash's slab
  if (close > 0.2) for (const mx of [ox + 4.6, ox + 16.8]) { ctx.globalAlpha = close; ctx.fillStyle = T.manhole; ctx.beginPath(); disc(ctx, mx, oy + 8.5, z, 0.3 * HW * 1.42, 0.3 * HH * 1.42); ctx.fill(); ctx.fillStyle = T.manholeHi; ctx.beginPath(); disc(ctx, mx, oy + 8.5, z + 0.6, 0.2 * HW * 1.42, 0.2 * HH * 1.42); ctx.fill(); ctx.globalAlpha = 1; }
  if (near > 0.05) paintPlazaMarks(ctx, view, D, walks, roads, pads, z, T, near, close);
}

/** Sidewalk pavers: half-tile slabs with a joint between them, a light and a dark slab here and there, and at close a lit edge along the two sides that face the sun. */
function paintPavers(ctx, view, id, walks, roads, z, T, near, close) {
  const [i0, i1, j0, j1] = gridRange(view, z + 8, 1), JW = 0.05, tiles = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    let w = null; for (const g of walks) if (i >= g.x - 0.01 && i + 1 <= g.x + g.w + 0.01 && j >= g.y - 0.01 && j + 1 <= g.y + g.d + 0.01) { w = g; break; }
    if (!w) continue; let onRoad = false; for (const r of roads) if (inRect(r, i + 0.5, j + 0.5)) { onRoad = true; break; }
    if (onRoad) continue;
    if (seen(view, px(i, j + 1), py(i, j, z) - 3, px(i + 1, j), py(i + 1, j + 1, z) + 3)) tiles.push(i, j);
  }
  if (!tiles.length) return;
  const slab = (lo, hi) => { ctx.beginPath(); for (let t = 0; t < tiles.length; t += 2) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const i = tiles[t], j = tiles[t + 1], h = h2(i * 4 + a + id * 131, j * 4 + b); if (h >= lo && h < hi) quadAt(ctx, i + a * 0.5 + JW / 2, j + b * 0.5 + JW / 2, 0.5 - JW, 0.5 - JW, z); } ctx.fill(); };
  ctx.fillStyle = T.walkLo; ctx.globalAlpha = near; slab(0, 0.22);
  ctx.fillStyle = T.walkHi; ctx.globalAlpha = near * 0.7; slab(0.82, 1.01);
  ctx.fillStyle = T.joint; ctx.globalAlpha = near * 0.75; ctx.beginPath(); // joints: between tiles at near, and between the half-tile slabs too at close
  for (let t = 0; t < tiles.length; t += 2) { const i = tiles[t], j = tiles[t + 1]; quadAt(ctx, i - JW / 2, j, JW, 1, z); quadAt(ctx, i, j - JW / 2, 1, JW, z); if (close > 0.3) { quadAt(ctx, i + 0.5 - JW / 2, j, JW, 1, z); quadAt(ctx, i, j + 0.5 - JW / 2, 1, JW, z); } }
  ctx.fill();
  if (close > 0.3) { ctx.fillStyle = T.walkHi; ctx.globalAlpha = close * 0.8; ctx.beginPath(); for (let t = 0; t < tiles.length; t += 2) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const gx = tiles[t] + a * 0.5, gy = tiles[t + 1] + b * 0.5; quadAt(ctx, gx + JW, gy + JW, 0.05, 0.5 - JW * 2, z); quadAt(ctx, gx + JW, gy + JW, 0.5 - JW * 2, 0.05, z); } ctx.fill(); }
  ctx.globalAlpha = 1;
}

/** The asphalt's wear: darker edges where the tyres do not run, a paler worn middle, a few patches of newer or older tar, stains, and (close) cracks. */
function paintAsphalt(ctx, view, id, roads, z, T, near, close) {
  const hs = roads.filter((r) => r.w > r.d), vs = roads.filter((r) => r.w <= r.d);
  const runs = (r) => { // the stretches of a street between the crossings
    const cross = (r.w > r.d ? vs : hs).filter((c) => c.x < r.x + r.w && c.x + c.w > r.x && c.y < r.y + r.d && c.y + c.d > r.y), out = []; let a = r.w > r.d ? r.x : r.y;
    const end = r.w > r.d ? r.x + r.w : r.y + r.d;
    for (const c of cross.sort((p, q) => (r.w > r.d ? p.x - q.x : p.y - q.y))) { const c0 = r.w > r.d ? c.x : c.y, c1 = r.w > r.d ? c.x + c.w : c.y + c.d; if (c0 > a) out.push([a, c0]); a = Math.max(a, c1); }
    if (a < end) out.push([a, end]); return out;
  };
  for (const r of roads) {
    const east = r.w > r.d;
    for (const [a, b] of runs(r)) {
      if (east) { fillQ(ctx, a, r.y, b - a, 0.3, z, T.asphLo, 0.3); fillQ(ctx, a, r.y + r.d - 0.3, b - a, 0.3, z, T.asphLo, 0.3); fillQ(ctx, a, r.y + 0.55, b - a, r.d - 1.1, z, T.asphHi, 0.1); }
      else { fillQ(ctx, r.x, a, 0.3, b - a, z, T.asphLo, 0.3); fillQ(ctx, r.x + r.w - 0.3, a, 0.3, b - a, z, T.asphLo, 0.3); fillQ(ctx, r.x + 0.55, a, r.w - 1.1, b - a, z, T.asphHi, 0.1); }
    }
    // patches of tar, the odd stain
    const len = east ? r.w : r.d, wid = east ? r.d : r.w;
    for (let n = 0; n < 7; n++) {
      const u = 0.8 + h2(id * 53 + n, east ? 3 : 4) * (len - 1.6), v = 0.35 + h2(id * 59 + n, 5) * (wid - 1.0), pw = 0.5 + h2(id * 61 + n, 6) * 0.7, pd = 0.38 + h2(id * 67 + n, 8) * 0.34;
      const gx = east ? r.x + u : r.x + v, gy = east ? r.y + v : r.y + u, w = east ? pw : pd, d = east ? pd : pw;
      if (cutByCross(roads, r, gx, gy, w, d)) continue;
      if (!seen(view, px(gx, gy + d), py(gx, gy, z) - 3, px(gx + w, gy), py(gx + w, gy + d, z) + 3)) continue;
      if (n % 3 === 0) { ctx.fillStyle = T.asphLo; ctx.globalAlpha = 0.08; ctx.beginPath(); disc(ctx, gx + w / 2, gy + d / 2, z, w * HW * 1.1, d * HH * 1.1); ctx.fill(); ctx.globalAlpha = 1; }
      else { fillRR(ctx, gx - 0.04, gy - 0.04, w + 0.08, d + 0.08, 0.12, z, T.seam, 0.5); fillRR(ctx, gx, gy, w, d, 0.1, z, n % 3 === 1 ? T.asphLo : T.asphHi, n % 3 === 1 ? 0.4 : 0.34); }
    }
    if (close > 0.2) {
      ctx.fillStyle = T.crack; ctx.globalAlpha = close * 0.5; ctx.beginPath();
      for (let n = 0; n < 8; n++) {
        const u = 0.6 + h2(id * 71 + n, east ? 9 : 10) * (len - 1.2), v = 0.4 + h2(id * 73 + n, 12) * (wid - 0.8), ang = (h2(id * 79 + n, 14) - 0.5) * 1.1 + (n % 2 ? 1.2 : 0), c = Math.cos(ang), s = Math.sin(ang);
        const gx = east ? r.x + u : r.x + v, gy = east ? r.y + v : r.y + u; if (cutByCross(roads, r, gx - 0.5, gy - 0.5, 1, 1)) continue;
        const o = crackOutline(id * 17 + n, 0.7 + h2(id * 83 + n, 15) * 0.7, 5, 0.06); let first = true;
        for (const [pu, pv] of o) { const a = east ? pu : pv, b = east ? pv : pu, X = gx + a * c - b * s, Y = gy + a * s + b * c; if (first) { ctx.moveTo(px(X, Y), py(X, Y, z)); first = false; } else ctx.lineTo(px(X, Y), py(X, Y, z)); }
        ctx.closePath();
      }
      ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}
/** Does the box [gx, gx + w] x [gy, gy + d], laid on road `r`, run into a street that crosses `r`? (Marks stay off the crossing, which is kept clean for the zebra bars.) */
function cutByCross(roads, r, gx, gy, w, d) {
  for (const c of roads) if (c !== r && gx < c.x + c.w + 0.2 && gx + w > c.x - 0.2 && gy < c.y + c.d + 0.2 && gy + d > c.y - 0.2) return true;
  return false;
}

/** Pebbles and dry tufts scattered on the bare dirt of the plaza (near and close): small round stones in a darker and a lighter tone, and a tuft of grass here and there, hashed per tile. */
function paintPlazaMarks(ctx, view, D, walks, roads, pads, z, T, near, close) {
  const [i0, i1, j0, j1] = gridRange(view, z + 8, 1), ox = D.ox, oy = D.oy, BW = D.w, BD = D.d, id = D.id | 0, per = 1 + (close > 0.3 ? 3 : 0), stones = [], tufts = [];
  for (let j = Math.max(j0, Math.floor(oy) + 1); j <= Math.min(j1, Math.floor(oy + BD) - 2); j++) for (let i = Math.max(i0, Math.floor(ox) + 1); i <= Math.min(i1, Math.floor(ox + BW) - 2); i++) {
    const cx = i + 0.5, cy = j + 0.5; let skip = false;
    for (const g of walks) if (inRect(g, cx, cy)) { skip = true; break; }
    if (skip) continue; for (const g of pads) if (cx > g.x - 0.6 && cx < g.x + g.w + 0.6 && cy > g.y - 0.6 && cy < g.y + g.d + 0.6) { skip = true; break; }
    if (skip || !seen(view, px(i, j + 1), py(i, j, z) - 12, px(i + 1, j), py(i + 1, j + 1, z) + 3)) continue;
    for (let q = 0; q < per; q++) stones.push(i + h2(i * 5 + q + id, j * 3 + 1), j + h2(i * 7 + id, j * 11 + q + 2), 0.55 + h2(i + q * 3, j * 5 + id) * 0.9, h2(i * 13 + q, j * 17) < 0.55 ? 0 : 1);
    if (h2(i * 19 + id, j * 23) < 0.14 + 0.16 * close) tufts.push(i + h2(i, j * 2), j + h2(i * 2, j), h2(i * 29, j * 31 + id));
  }
  const dots = (kind) => { ctx.beginPath(); for (let t = 0; t < stones.length; t += 4) if (stones[t + 3] === kind) disc(ctx, stones[t], stones[t + 1], z, stones[t + 2] * 1.5, stones[t + 2] * 0.85); ctx.fill(); };
  ctx.globalAlpha = near * 0.7; ctx.fillStyle = T.pebLo; dots(0); ctx.globalAlpha = near * 0.8; ctx.fillStyle = T.pebHi; dots(1);
  ctx.globalAlpha = near * 0.85;
  for (let q = 0; q < 3; q++) { ctx.fillStyle = T.tuft[q]; ctx.beginPath(); for (let t = 0; t < tufts.length; t += 3) if (((tufts[t + 2] * 3) | 0) === q) tuft(ctx, px(tufts[t], tufts[t + 1]), py(tufts[t], tufts[t + 1], z), tufts[t + 2]); ctx.fill(); }
  ctx.globalAlpha = 1;
}

/** Soft grass along the outside of the block's edge (near and close): tufts leaning out of the dirt so the stage meets the meadow in grass and not in a line. `land(gx, gy)` says whether a point is ground, `free(gx, gy)` whether nothing stands there. */
export function paintFringe(ctx, view, D, z, detail, T, land, free) {
  const near = detail[2]; if (near < 0.05 || !seen(view, D.bb[0], D.bb[1], D.bb[2], D.bb[3] + 200)) return;
  const ox = D.ox, oy = D.oy, BW = D.w, BD = D.d, id = D.id | 0, items = [];
  const edge = (a0, a1, fixed, horiz, sgn, tag) => {
    for (let t = a0; t < a1; t += 0.6) {
      const h = h2(id * 97 + ((t * 100) | 0), tag), off = 0.05 + h * 0.8 * (h2(id + ((t * 53) | 0), tag + 9) < 0.6 ? 1 : 0.35), u = t + (h2(id + ((t * 71) | 0), tag + 3) - 0.5) * 0.3;
      const gx = horiz ? u : fixed + sgn * off, gy = horiz ? fixed + sgn * off : u, rel = horiz ? u - ox : u - oy;
      if (!land(gx, gy) || !free(gx, gy)) continue;
      if (horiz ? rel > 8.4 && rel < 13.6 : rel > 6.6 && rel < 11.6) continue; // no grass where a street leaves the block
      const x = px(gx, gy), y = py(gx, gy, z); if (!seen(view, x - 8, y - 12, x + 8, y + 3)) continue;
      items.push(x, y, h2(id * 11 + ((t * 31) | 0), tag + 21));
    }
  };
  edge(ox + 0.6, ox + BW - 0.6, oy - 0.02, true, -1, 1); edge(ox + 0.6, ox + BW - 0.6, oy + BD + 0.02, true, 1, 2); edge(oy + 0.6, oy + BD - 0.6, ox - 0.02, false, -1, 3); edge(oy + 0.6, oy + BD - 0.6, ox + BW + 0.02, false, 1, 4);
  if (!items.length) return;
  ctx.globalAlpha = near;
  for (let q = 0; q < 3; q++) { ctx.fillStyle = T.tuft[q]; ctx.beginPath(); for (let t = 0; t < items.length; t += 3) if (((items[t + 2] * 3) | 0) === q) tuft(ctx, items[t], items[t + 1], items[t + 2], 6 + items[t + 2] * 4); ctx.fill(); }
  ctx.globalAlpha = 1;
}
export { rrect, fillRR, fillQ, disc, shade, clamp };
