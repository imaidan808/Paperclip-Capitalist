// The cloud bank over a locked district, as geometry: where the puffs go, how much of the district they cover, and what drawing them costs. Pure: nothing here draws or reads the game.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md section 6). This is the first version, written with the plan because the plan's first sizing could not be met (14 to 42 puffs of radius 22 to 64
// cover 12 to 68% of a district, never the 85% the bank must), and so that the rule has a test on the sixteen real footprints. T2 deepens it (rows, rim, windows, the dissolve); the numbers are the contract.
//
// The rule. A puff's radius is a share of the footprint's width on the screen (`spanOf`, (w + d) x 32 world pixels), so a big district gets big puffs and the count stays about the same (60 to 120) whatever the size.
// Puffs stand on a hex lattice in the screen plane, three tiers deep (back, middle, front: the back tier larger and raised, the front smaller and lowest), a row at a time from the top of the footprint to its foot, each row
// running past the outline by `rim` radii so the bank has a rounded rim and no gap at the edge. Centre spacing is 1.5 radii, so every puff overlaps six neighbours by 0.5 radius (the rule asks for two, by 0.35).
import { P, h2, clamp } from './iso.js';

export const BANK = Object.freeze({
  radius: 0.042,                       // puff radius, as a share of spanOf(fp)
  rMin: 40, rMax: 125,                 // and its limits, world pixels (a bank never reads as dust, and never as a single lump)
  spacing: 1.5,                        // centre distance in radii of the smaller of two neighbours: overlap = 0.5 r
  rim: 0.4,                            // how far outside the outline a row runs, in radii
  tiers: Object.freeze([1.15, 1.0, 0.85]), // radius of the back, middle and front tier, times the base radius
  lift: Object.freeze([0.30, 0.12, 0]),    // how far each tier stands above its lattice row, in base radii (the back is a dome behind, the front sits on the ground)
  jitter: 0.07,                        // lattice jitter, in spacings (hashed, so a bank is the same bank every time)
  coverMin: 0.85, overlapMin: 0.35,    // the art direction's rule: coverage of the footprint, overlap of each puff with two neighbours (of the smaller radius)
  countMin: 40, countMax: 150,
});

/**
 * How coarse the bank is drawn at a camera zoom: 0 below 0.30 (far: the district's one baked bank sprite, a blit), 1.6 from 0.30 to 0.70 (mid: a third of the puffs: a window of the middle zoom holds four or five
 * banks, and a puff costs the same however small it is), 1 from 0.70 (near and close: the fine bank). The change is made under a crossfade of the two sets over 0.60 to 0.80, never a pop (T2).
 */
export const bankScale = (zoom) => (zoom < 0.30 ? 0 : zoom < 0.70 ? 1.6 : 1);

/** The footprint's width on the screen, world pixels: (w + d) tiles x 32. */
export const spanOf = (fp) => (fp[2] + fp[3]) * 32;
/** The base puff radius for a footprint [gx, gy, w, d]. */
export const puffRadius = (fp) => clamp(BANK.radius * spanOf(fp), BANK.rMin, BANK.rMax);
/** The footprint's outline on the screen at elevation z: top, right, bottom, left corners. */
export const outlineOf = (fp, z = 0) => [P(fp[0], fp[1], z), P(fp[0] + fp[2], fp[1], z), P(fp[0] + fp[2], fp[1] + fp[3], z), P(fp[0], fp[1] + fp[3], z)];
/** The screen area of a footprint, world pixels squared: 1,024 per tile (the iso projection's determinant). */
export const areaOf = (fp) => fp[2] * fp[3] * 1024;

/** The x extent [xa, xb] of a convex polygon at a height y (the nearest height inside it when y is above or below). */
function extentAt(poly, y) {
  let top = Infinity, bot = -Infinity; for (const q of poly) { if (q[1] < top) top = q[1]; if (q[1] > bot) bot = q[1]; }
  const yy = clamp(y, top, bot); let xa = Infinity, xb = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
    if (yy < lo || yy > hi) continue;
    const x = hi === lo ? a[0] : a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    if (x < xa) xa = x; if (x > xb) xb = x;
  }
  return [xa, xb];
}

/**
 * The puffs of the bank over footprint `fp` = [gx, gy, w, d] (a district's `fp`) standing on ground at elevation `z`: [{ x, y, r, row, k }], x and y in world pixels, `row` 0 back, 1 middle, 2 front (the draw order
 * is the array order: back to front), `k` 0..1 a hash for the bob's phase and period. The same footprint gives the same bank. Never empty. `scale` multiplies every radius and spacing (the coarse bank of the
 * middle zooms is scale 1.6: a third of the puffs, one outline, the same rules; see bankScale).
 */
export function bankPuffs(fp, z = 0, scale = 1) {
  const poly = outlineOf(fp, z), r0 = puffRadius(fp) * scale, top = Math.min(...poly.map((q) => q[1])), bot = Math.max(...poly.map((q) => q[1])), H = Math.max(1, bot - top), seed = ((fp[0] * 131 + fp[1] * 17) | 0), out = [];
  let y = top - BANK.rim * r0 * 0.6, j = 0;
  while (y <= bot + BANK.rim * r0 * 0.6) {
    const tier = clamp(Math.floor((3 * (y - top)) / H), 0, 2), r = r0 * BANK.tiers[tier], s = BANK.spacing * r, [xa, xb] = extentAt(poly, y), x0 = xa - BANK.rim * r, x1 = xb + BANK.rim * r;
    const phase = (j & 1) * 0.5, c0 = Math.floor(x0 / s); // the columns stand on a grid of their own spacing (c0 from the left), so the rows of one tier line up
    for (let i = 0, x = (c0 + phase) * s; x <= x1; i++, x += s) {
      const jx = (h2(seed + j, i) - 0.5) * 2 * BANK.jitter * s, jy = (h2(seed + 977 + j, i) - 0.5) * 2 * BANK.jitter * s;
      out.push({ x: x + jx, y: y + jy - BANK.lift[tier] * r0, r, row: tier, k: h2(seed + 31 * j, i + 7) });
    }
    y += 0.87 * s; j++; // a hex lattice: the rows are 0.87 spacings apart
  }
  // a puff at the end of a row with fewer than two neighbours that it overlaps by the rule's share is a stray (a lump on the rim): take it out, and look again, so no puff is ever on its own
  let list = out;
  for (let pass = 0; pass < 4; pass++) {
    const weak = new Set(); for (let a = 0; a < list.length; a++) { let n = 0; for (let b = 0; b < list.length && n < 2; b++) if (a !== b && overlapOf(list[a], list[b]) >= BANK.overlapMin * Math.min(list[a].r, list[b].r)) n++; if (n < 2) weak.add(a); }
    if (!weak.size) break; const kept = list.filter((_, i) => !weak.has(i)); if (!kept.length) break; list = kept; // (a footprint so small that no puff has two neighbours keeps what it has: a bank is never empty)
  }
  list.sort((a, b) => a.row - b.row || a.y - b.y); // back to front, and within a tier top to bottom
  return list;
}

/** The share of the footprint's outline (at elevation z) that some puff covers: the footprint is sampled every `step` world pixels. */
export function coverage(puffs, fp, z = 0, step = 12) {
  const poly = outlineOf(fp, z), top = Math.min(...poly.map((q) => q[1])), bot = Math.max(...poly.map((q) => q[1])); let hit = 0, all = 0;
  const grid = new Map(), cell = 2 * BANK.rMax; // puffs bucketed by 250 px cells, so a sample asks only the puffs near it
  for (const p of puffs) { const key = Math.floor(p.x / cell) * 4096 + Math.floor(p.y / cell); (grid.get(key) || grid.set(key, []).get(key)).push(p); }
  for (let y = top + step / 2; y < bot; y += step) {
    const [xa, xb] = extentAt(poly, y);
    for (let x = xa + step / 2; x < xb; x += step) {
      all++; const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let covered = false;
      for (let a = cx - 1; a <= cx + 1 && !covered; a++) for (let b = cy - 1; b <= cy + 1 && !covered; b++) { const L = grid.get(a * 4096 + b); if (L) for (const p of L) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= p.r * p.r) { covered = true; break; } }
      if (covered) hit++;
    }
  }
  return all ? hit / all : 0;
}

/** How much two puffs overlap, in world pixels along the line between their centres (negative when they are apart). */
export const overlapOf = (a, b) => a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
/**
 * The bank's structure: how many puffs overlap each puff by at least `min` of the smaller radius (the art direction's 35%), the fewest over all puffs, and how many connected masses the union of the puffs makes
 * (1: one cloud, never islands of puffs). { fewest, components, isolated }.
 */
export function structure(puffs, min = BANK.overlapMin) {
  const n = puffs.length, near = new Array(n).fill(0), parent = Array.from({ length: n }, (_, i) => i), find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const o = overlapOf(puffs[i], puffs[j]); if (o <= 0) continue;
    parent[find(i)] = find(j);
    if (o >= min * Math.min(puffs[i].r, puffs[j].r)) { near[i]++; near[j]++; }
  }
  const size = new Map(); for (let i = 0; i < n; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
  return { fewest: n ? Math.min(...near) : 0, components: size.size, smallest: size.size ? Math.min(...size.values()) : 0, isolated: near.filter((c) => c < 2).length }; // `smallest`: how many puffs the smallest connected mass has
}

/**
 * The most a bank of `n` puffs of radius `r` can cover of a footprint of `area` while every puff overlaps its neighbours by `min` of its radius: a hex lattice at centre distance (2 - min) r, each puff
 * answering for (sqrt(3) / 2) ((2 - min) r)^2 of the plane. The first sizing of the art direction (n = clamp(round(tiles / 14), 14, 42), r at most 64) is held to this by the tests.
 */
export const maxCoverage = (n, r, area, min = BANK.overlapMin) => Math.min(1, (n * (Math.sqrt(3) / 2) * ((2 - min) * r) ** 2) / area);

/**
 * What drawing the bank costs, in megapixels of fill (device pixels): each puff is a disc of its own radius (`kind` 'flat': the body, plus a belly and a top crescent drawn as paths of a quarter of the disc each, so 1.5
 * discs of fill; 'clip': the body with the belly and the top as clipped fills, 3 discs), counted for the puffs that touch `view` (a world rectangle) at `zoom` and canvas density `dpr`, the part of each disc that is on
 * screen. Multiply by the unit cost of a fill (scripts/diag/unitcost.mjs: 0.41 ms per megapixel on the budget machine) for milliseconds.
 */
export function fillMpx(puffs, zoom, dpr, view, kind = 'flat') {
  const k = zoom * zoom * dpr * dpr, mult = kind === 'clip' ? 3 : 1.5; let px = 0;
  for (const p of puffs) {
    if (p.x + p.r < view.x0 || p.x - p.r > view.x1 || p.y + p.r < view.y0 || p.y - p.r > view.y1) continue;
    // the part of the disc inside the view: its bounding box clipped, times pi/4 (a disc fills pi/4 of its box)
    const w = Math.min(p.x + p.r, view.x1) - Math.max(p.x - p.r, view.x0), h = Math.min(p.y + p.r, view.y1) - Math.max(p.y - p.r, view.y0);
    px += (Math.PI / 4) * w * h * k * mult;
  }
  return px / 1e6;
}

/** Puffs of the bank that touch a world rectangle. */
export const inView = (puffs, view) => puffs.reduce((n, p) => n + (p.x + p.r < view.x0 || p.x - p.r > view.x1 || p.y + p.r < view.y0 || p.y - p.r > view.y1 ? 0 : 1), 0);
/**
 * The planning model of what a bank costs a frame, in milliseconds, on the budget machine (software raster, a readback after the draw): a fixed part for every puff that is drawn (three path fills: about
 * 27 microseconds) and a part for the fill (1.2 ms per megapixel: a path fill of a soft shape, alpha 0.8 to 0.9). Fitted to scripts/diag/cloudcost.mjs and kept above what it measured at its seven scenes,
 * at density 1.5 and 2, so a budget row built on it is a ceiling and not a forecast. The plan's cloud cells are this model on the real layout (tests/world-cloudbank.test.mjs).
 */
export const PUFF_MS = 0.027, FILL_MS_PER_MPX = 1.2;
export const bankMs = (puffs, zoom, dpr, view) => PUFF_MS * inView(puffs, view) + FILL_MS_PER_MPX * fillMpx(puffs, zoom, dpr, view, 'flat');

/** The cost of a baked bank sprite blitted scaled to its footprint's bounding box on screen (the far zoom: one blit per locked district): 3.2 ms per megapixel of destination, scaled and smoothed. */
export const SPRITE_MS_PER_MPX = 3.2;
export function spriteMs(fp, zoom, dpr, view, z = 0) {
  const o = outlineOf(fp, z), x0 = Math.min(...o.map((q) => q[0])), x1 = Math.max(...o.map((q) => q[0])), y0 = Math.min(...o.map((q) => q[1])), y1 = Math.max(...o.map((q) => q[1]));
  if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) return 0;
  return 0.03 + ((x1 - x0) * (y1 - y0) * zoom * zoom * dpr * dpr * SPRITE_MS_PER_MPX) / 1e6;
}
/**
 * What the clouds cost in one budget scene: the camera stands at world point (x, y) at `zoom` in a window of `window` css pixels, the canvas is drawn at density `dpr`, and every district of `dist` (an object of
 * { fp, z } by id) that is not in `open` has a bank: a baked sprite below 0.30 (spriteMs), the coarse puffs from 0.30 to 0.70 and the fine puffs above (bankMs). Answers milliseconds.
 */
export function sceneCloudMs(dist, open, x, y, zoom, dpr, window = [1440, 900]) {
  const view = { x0: x - window[0] / 2 / zoom, x1: x + window[0] / 2 / zoom, y0: y - window[1] / 2 / zoom, y1: y + window[1] / 2 / zoom }, scale = bankScale(zoom); let ms = 0;
  for (const id of Object.keys(dist)) { if (open.includes(+id)) continue; const D = dist[id]; ms += scale ? bankMs(bankPuffs(D.fp, D.z, scale), zoom, dpr, view) : spriteMs(D.fp, zoom, dpr, view, D.z); }
  return ms;
}
