// The colour of the land, one colour per terrain vertex: a pure function of the island's heights, its districts and the districts that are still locked. Art direction 5.8.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Nothing here draws: rasterbase.js lays these colours across the mesh (Gouraud, so no tile ever shows) and adds the per-pixel grain, beach and coast.
//
// A vertex's colour is built from the toy palette and nothing else: the meadow (two greens, dry and deep patches, each a few tiles across, from value noise), the height (hills darken and cool, plateaus pale
// towards lilac rock), the slope (steep ground goes to sandstone or lilac rock), the district (its pastel ground blended in over six tiles and never fully, so the island is one green world with coloured
// quarters and not a collage of dyes), the sun (faces towards the upper left take warm light, faces away take violet shade, smoothly: no band per tile) and, for a locked district, the veil of the cloud
// above it (desaturated and lifted, never darker). Water vertices take the colour of the land beside them so the smooth coast, which strays a quarter tile past the tile coast, has colour under it.
import { rgb, clamp } from './iso.js';
import { GRASS, SAND, ROCK, ROCKHI, LIGHT, CLOUD, groundSet } from './palette.js';
import { vnoise, smooth } from './noise.js';

const C = (hexv) => Float32Array.from(rgb(hexv)); // palette token -> [r, g, b]
const T = { mid: C(GRASS.mid), light: C(GRASS.light), dry: C(GRASS.dry), deep: C(GRASS.lawnShade), shade: C(GRASS.shade), rock: C(ROCK.light), rockMid: C(ROCK.mid), rockHi: C(ROCKHI.mid), rockPale: C(ROCKHI.light), key: C(LIGHT.key), ao: C(LIGHT.ao), cloud: C(CLOUD.veil), sand: C(SAND.light) };
/** The four regions' tints, lifted for daylight (art direction 5.8): a breath of colour, never a dye. */
export const REGION_TINT = Object.freeze({ A: '#c8a45a', B: '#6fa8d8', C: '#9bd06a', D: '#e8d08a' });
const lerp3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
/** How much of the cloud's veil the ground under it wears: enough to say it is asleep, not enough to bury its colours (the cloud above does the rest). */
export const VEIL = 0.6;
const rectDist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3])));

/** The veil over a colour under cloud (palette.veiled in float): desaturated by 0.45 and 22% towards the cloud's lilac-white. */
export function veilColour(o, c, k) {
  const y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  o[0] = (c[0] + (y - c[0]) * 0.45 * k) + (T.cloud[0] - (c[0] + (y - c[0]) * 0.45 * k)) * 0.22 * k; o[1] = (c[1] + (y - c[1]) * 0.45 * k) + (T.cloud[1] - (c[1] + (y - c[1]) * 0.45 * k)) * 0.22 * k; o[2] = (c[2] + (y - c[2]) * 0.45 * k) + (T.cloud[2] - (c[2] + (y - c[2]) * 0.45 * k)) * 0.22 * k;
  return o;
}

/**
 * The terrain field. `L` is { ZV, VW, GW, GH, land, ids, DIST, REGIONS } (the arrays of buildLayout), `coast` the buildCoast record, `locked` a Set of the district ids still under cloud.
 * Answers { r, g, b, z, inl, mesh, VW, GW, GH }: colour channels 0..255 and heights per vertex, the signed distance to the coast per vertex (tiles, negative on land) and the mesh flags per tile
 * (1 where the tile is land or touches land: the tiles the rasteriser walks, so the smooth coast has ground under it).
 */
export function terrainField(L, coast, locked = new Set()) {
  const { ZV, VW, GW, GH, land, ids, DIST } = L, VH = GH + 1, VN = VW * VH, r = new Float32Array(VN), g = new Float32Array(VN), b = new Float32Array(VN), z = new Float32Array(VN), inl = new Float32Array(VN), has = new Uint8Array(VN);
  const sets = {}; for (const id of ids) sets[id] = groundSet(DIST[id].theme) || { ground: DIST[id].cols.ground, hi: DIST[id].cols.ground, alt: DIST[id].cols.ground };
  const col = new Float32Array(3), tmp = new Float32Array(3), gr = new Float32Array(3), hi = new Float32Array(3), Z = (i, j) => ZV[Math.min(Math.max(j, 0), GH) * VW + Math.min(Math.max(i, 0), GW)];
  const lit = new Float32Array(VN), steep = new Float32Array(VN);
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) { // slope and sun, smoothed over the neighbours so a hillside has one light and no step per tile
    const dzx = (Z(i + 1, j) - Z(i - 1, j)) / 2, dzy = (Z(i, j + 1) - Z(i, j - 1)) / 2;
    lit[j * VW + i] = clamp((dzx * 0.9 + dzy * 0.3) / 9, -1, 1); steep[j * VW + i] = Math.hypot(dzx, dzy);
  }
  const litS = new Float32Array(VN), steepS = new Float32Array(VN);
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) { let a = 0, s = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > GW || jj > GH) continue; a += lit[jj * VW + ii]; s += steep[jj * VW + ii]; n++; } litS[j * VW + i] = a / n; steepS[j * VW + i] = s / n; }
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
    const k = j * VW + i, h = ZV[k]; z[k] = h; inl[k] = coast.dist(i, j);
    if (!(h > 0)) continue; // water vertex: coloured below, from its neighbours
    has[k] = 1;
    const nLow = vnoise(i * 0.085 + 3, j * 0.085), nMid = vnoise(i * 0.22, j * 0.22 + 9), nDeep = vnoise(i * 0.16 + 40, j * 0.16 + 7);
    lerp3(col, T.mid, T.light, smooth(0.3, 0.78, nLow));
    lerp3(col, col, T.dry, 0.55 * smooth(0.62, 0.82, nMid) * smooth(0.32, 0.68, nLow));
    lerp3(col, col, T.deep, 0.5 * smooth(0.66, 0.86, nDeep));
    lerp3(col, col, T.shade, 0.38 * smooth(26, 72, h));      // the hills darken a little...
    lerp3(col, col, T.rockPale, 0.42 * smooth(62, 96, h));   // ...and the plateau goes pale and cool
    const s = steepS[k], rw = 0.88 * smooth(5.2, 10.5, s); // steep ground: sandstone low down, lilac rock up high
    if (rw > 0) { lerp3(tmp, h < 38 ? T.rock : T.rockMid, T.rockHi, smooth(30, 70, h)); lerp3(col, col, tmp, rw); }
    // the nearest district: its pastel ground, blended in over six tiles and never fully
    let nd = ids[0], dd = 1e9; for (const id of ids) { const d = rectDist(i, j, DIST[id].fp); if (d < dd) { dd = d; nd = id; } }
    const gs = sets[nd]; gr.set(rgb(gs.ground)); hi.set(rgb(gs.hi)); lerp3(gr, gr, hi, 0.55 * smooth(0.35, 0.8, nMid)); // a district's ground is not one flat dye either
    const wD = dd <= 0 ? 0.88 : smooth(0, 1, 1 - dd / 6.5) * 0.7;
    if (wD > 0.01 && rw < 0.9) lerp3(col, col, gr, wD * (1 - rw * 0.8));
    tmp.set(rgb(REGION_TINT[DIST[nd].region] || REGION_TINT.A)); lerp3(col, col, tmp, 0.05);
    const l = litS[k]; if (l > 0) lerp3(col, col, T.key, 0.16 * l); else lerp3(col, col, T.ao, -0.2 * l);
    if (locked.has(nd)) { const w = smooth(0, 1, 1 - Math.max(0, dd) / 1.5); if (w > 0.01) { veilColour(tmp, col, VEIL); lerp3(col, col, tmp, w); } }
    r[k] = col[0]; g[k] = col[1]; b[k] = col[2];
  }
  for (let pass = 0; pass < 5; pass++) { // water vertices take the colour of the land beside them (a few rings of it: the coast may stray a quarter tile past the tile coast, the mesh a tile)
    const add = [];
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
      const k = j * VW + i; if (has[k]) continue;
      let n = 0, sr = 0, sg = 0, sb = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > GW || jj > GH) continue; const q = jj * VW + ii; if (has[q]) { sr += r[q]; sg += g[q]; sb += b[q]; n++; } }
      if (n) add.push(k, sr / n, sg / n, sb / n);
    }
    for (let q = 0; q < add.length; q += 4) { const k = add[q]; r[k] = add[q + 1]; g[k] = add[q + 2]; b[k] = add[q + 3]; has[k] = 1; }
  }
  const mesh = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let on = 0; for (let dj = -1; dj <= 1 && !on; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < GW && jj < GH && land[jj * GW + ii]) { on = 1; break; } } mesh[j * GW + i] = on; }
  return { r, g, b, z, inl, mesh, VW, GW, GH };
}
