// The cloud bank as it is PAINTED: the lobes it is made of, the windows in it and where the cloud is thick. Pure: nothing here draws or reads the game.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md section 6). cloudbank.js says where the lattice puffs stand and holds the plan's coverage and structure rules to them; this file turns that lattice into
// the bank the player sees, because a bank painted as the lattice (one radius to a tier, every puff a stamp of the one before) read as bubble wrap (judge round 1, F1) and as a slab that hid the district (F2).
//
// What a bank is. The mass is the lattice puffs with their radii spread (0.90 to 1.18 of the lattice's) and a hashed nudge, so no two neighbours are the same disc and the mass still covers what the lattice covered. On it
// stand a few TOWERS (lobes of 1.35 to 1.7 times the radius, raised: the big ones of the core, which give the dome its shoulders), and along every exposed edge small RIM lobes (0.4 to 0.7 of the radius, and on the
// bigger of those a lump of 0.3 on the lump) so the outline scallops at three sizes: a cloud's edge is lumps on lumps. Two or three WINDOWS are cut: a clearing where the lattice puffs are left out and a ring of small
// lobes stands round it, so the ground shows through a hole with a rim of its own, lit like the outer edge. One window is placed by the gate (the road into the district shows), the others at hashed places of the
// footprint, never at the heart, where the padlock floats on solid cloud. Everything is a function of the district and the scale: the same district gives the same bank.
import { P, h2, clamp } from './iso.js';
import { bankPuffs, puffRadius, outlineOf, spanOf } from './cloudbank.js';

export const FORM = Object.freeze({
  spread: Object.freeze([0.90, 1.18]),  // the mass lobe's radius, as a share of its lattice puff's (hashed)
  nudge: 0.11,                          // its centre's hashed move, in radii
  towers: Object.freeze({ every: 8, least: 5, min: 1.35, max: 1.7, lift: 0.3 }),   // one lattice puff in `every` of the back and middle tiers grows a tower (five at the least)
  rim: Object.freeze({ min: 0.5, max: 0.85, odds: 0.5, lump: 0.2 }),     // rim lobes: radius share, the chance an exposed direction gets one, and the chance a rim lobe carries a lump of its own
  window: Object.freeze({ share: 0.112, maxShare: 0.17, ratio: 0.52, hole: 0.72, ring: 0.8, heart: 0.19 }), // a window's half width as a share of the footprint's span, its limit, the squash of a ground circle, how much of it is cleared of every lobe that would reach into it, the ring lobes' radius in radii, the distance from the heart (in footprint widths) inside which no window stands
  cell: 24,                             // the side of the cover grid, world px
});
/** How far the shadow of a bank reaches past its box to the right and down, world px (cloudpaint.js paintCloudShadow: the light's push, at the longest, and the soft stamps' own radii). */
export const REACH = Object.freeze({ x: 230, y: 140 });
/** How many windows a bank has at a scale: three on the fine and the coarse bank, two on a far one (a bank of lobes of 2.6 times the radius cannot hold three without falling in two; the bank of the whole-island view is the coarse one). */
export const windowCount = (scale) => (scale > 2 ? 2 : 3);

/** The window ellipses of a district: [{ x, y, rx, ry }] in world px. The first stands a quarter of the way from the gate to the heart; the rest at hashed places of the interior, apart from each other and from the heart. */
export function windowsOf(D, scale = 1, n = windowCount(scale)) {
  const fp = D.fp, z = D.z, [gx, gy, w, d] = fp, span = spanOf(fp), seed = ((gx * 131 + gy * 17) | 0) + 5, W = FORM.window, rx = clamp(W.share * span, 0, W.maxShare * span), cx = gx + w / 2, cy = gy + d / 2;
  const out = [], put = (u, v) => { const [x, y] = P(gx + u * w, gy + v * d, z); out.push({ x, y, rx, ry: rx * W.ratio }); };
  const g = D.gateAt || { x: cx, y: cy }; // the gate's grid point, drawn a quarter of the way towards the heart: the road in shows
  let gu = clamp(((g.x + (cx - g.x) * 0.3) - gx) / w, 0.2, 0.8), gv = clamp(((g.y + (cy - g.y) * 0.3) - gy) / d, 0.2, 0.8);
  const dh = Math.hypot(gu - 0.5, gv - 0.5); if (dh < W.heart) { const k = dh > 1e-6 ? W.heart / dh : 0; gu = 0.5 + (gu - 0.5) * k + (dh > 1e-6 ? 0 : W.heart); gv = 0.5 + (gv - 0.5) * k; } // never the heart: the padlock floats there on solid cloud
  if (n >= 1) put(gu, gv);
  for (let tries = 0; out.length < n && tries < 240; tries++) {
    const sep = tries < 60 ? 1.9 : tries < 140 ? 1.6 : 1.35, u = 0.26 + 0.48 * h2(seed, 40 + tries * 2), v = 0.26 + 0.48 * h2(seed, 41 + tries * 2);
    if (Math.hypot(u - 0.5, v - 0.5) < W.heart) continue;
    const [x, y] = P(gx + u * w, gy + v * d, z); if (out.every((o) => Math.hypot((o.x - x) / (sep * rx), (o.y - y) / (sep * rx * W.ratio)) > 1)) put(u, v); // and clear of the others
  }
  return out;
}
/** How far a point is inside an ellipse: 0 at its centre, 1 on its edge. */
export const insideOf = (win, x, y) => Math.hypot((x - win.x) / win.rx, (y - win.y) / win.ry);

const TAU = Math.PI * 2;
/**
 * The painted bank of district `D` at a lattice scale (1 fine, 1.6 coarse, 2.6 far): { lobes, windows, box, cx, cy, r0, outline, puffs, cover }. `lobes` is [{ x, y, r, row, k, kind }] sorted back to front
 * (kind 0 mass, 1 tower, 2 rim, 3 the ring of a window; `edge` 1 for a lobe on an outline), `row` 0 back, 1 middle, 2 front, `k` a hash 0..1 for whatever varies from lobe to lobe. `puffs` is the lattice (cloudbank.js: what the plan's rules hold),
 * `box` the world rectangle every lobe is inside, with a margin for its contour. `cover` is a grid (cell FORM.cell) of the lobes' union, for the light pools and the tests.
 */
export function formOf(D, scale = 1) {
  const fp = D.fp, z = D.z, puffs = bankPuffs(fp, z, scale), o = outlineOf(fp, z), r0 = puffRadius(fp) * scale, seed = ((fp[0] * 131 + fp[1] * 17) | 0), wins = windowsOf(D, scale), F = FORM, W = F.window;
  const top = Math.min(...o.map((q) => q[1])), bot = Math.max(...o.map((q) => q[1])), left = Math.min(...o.map((q) => q[0])), right = Math.max(...o.map((q) => q[0]));
  const lobes = [], inWin = (x, y, r) => { for (const wn of wins) if (Math.hypot((x - wn.x) / (W.hole * wn.rx + r), (y - wn.y) / (W.hole * wn.ry + r)) < 1) return true; return false; }; // a disc that reaches into the cleared part of a window
  // ---- the mass: every lattice puff, its radius spread and its centre nudged; the ones standing in a window are left out
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i], m = F.spread[0] + (F.spread[1] - F.spread[0]) * h2(seed + 301, i), x = p.x + (h2(seed + 302, i) - 0.5) * 2 * F.nudge * p.r, y = p.y + (h2(seed + 303, i) - 0.5) * 2 * F.nudge * p.r;
    if (inWin(x, y, p.r * m)) continue;
    lobes.push({ x, y, r: p.r * m, row: p.row, k: p.k, kind: 0 });
  }
  const mass = lobes.length;
  // ---- the towers: the big lobes of the core (back and middle tiers, off the edge), raised, so the dome has shoulders and the radii are not one size
  const eligible = []; for (let i = 0; i < mass; i++) if (lobes[i].row <= 1) eligible.push([h2(seed + 311, i), i]);
  eligible.sort((p, q) => p[0] - q[0]);
  for (let n = 0, made = 0; n < eligible.length && made < Math.max(F.towers.least, Math.round(eligible.length / F.towers.every)); n++) {
    const i = eligible[n][1], l = lobes[i], r = l.r * (F.towers.min + (F.towers.max - F.towers.min) * h2(seed + 312, i)), x = l.x + (h2(seed + 313, i) - 0.5) * l.r * 0.5, y = l.y - F.towers.lift * l.r;
    if (inWin(x, y, r)) continue;
    lobes.push({ x, y, r, row: l.row, k: h2(seed + 314, i), kind: 1 }); made++;
  }
  // ---- which lobes stand on the outline: a point just inside the edge, in eight directions, that no other lobe covers
  const n0 = lobes.length, exposed = (i, d) => {
    const l = lobes[i], a = d * Math.PI / 4, qx = l.x + Math.cos(a) * l.r * 0.9, qy = l.y + Math.sin(a) * l.r * 0.9;
    for (let j = 0; j < n0; j++) { if (j === i) continue; const q = lobes[j], dx = qx - q.x, dy = qy - q.y; if (dx * dx + dy * dy < q.r * q.r * 0.9) return false; }
    return true;
  };
  // ---- the rim: small lobes on every exposed side, and on the bigger of them a lump of their own
  for (let i = 0; i < n0; i++) {
    const l = lobes[i]; let ex = 0;
    for (let d = 0; d < 8; d++) {
      if (!exposed(i, d)) continue; ex++; const hk = h2(seed + 321 + d * 7, i); if (hk > F.rim.odds) continue;
      const a = d * Math.PI / 4 + (h2(seed + 322 + d, i) - 0.5) * 0.5, kr = l.r * (F.rim.min + (F.rim.max - F.rim.min) * h2(seed + 323 + d, i)), x = l.x + Math.cos(a) * l.r * 0.96, y = l.y + Math.sin(a) * l.r * 0.96;
      if (inWin(x, y, kr)) continue;
      let hidden = false; for (let j = 0; j < n0 && !hidden; j++) { if (j === i) continue; const q = lobes[j]; if ((x - q.x) ** 2 + (y - q.y) ** 2 < (q.r * 0.7) ** 2) hidden = true; }
      if (hidden) continue;
      lobes.push({ x, y, r: kr, row: l.row, k: h2(seed + 324 + d, i), kind: 2, edge: 1 });
      if (kr > r0 * 0.4 && h2(seed + 325 + d, i) < F.rim.lump) { const b = a + (h2(seed + 326 + d, i) - 0.5) * 1.2, lr = kr * 0.55, lx = x + Math.cos(b) * kr * 0.9, ly = y + Math.sin(b) * kr * 0.9; if (!inWin(lx, ly, lr)) lobes.push({ x: lx, y: ly, r: lr, row: l.row, k: h2(seed + 327 + d, i), kind: 2, edge: 1 }); }
    }
    if (ex) l.edge = 1; // a lobe on the outline is `edge`: it is painted with the full shade; one inside the mass is painted nearly flat, so the interior reads as one soft mass and the outline as a form
  }
  // ---- the windows' rims: a ring of small lobes round each clearing, so a window has an edge of its own, lumpy and lit like the bank's
  wins.forEach((wn, wi) => {
    const rk = r0 * W.ring, per = TAU * Math.sqrt((wn.rx * wn.rx + wn.ry * wn.ry) / 2), m = Math.max(7, Math.round(per / (rk * 1.55)));
    for (let q = 0; q < m; q++) {
      const a = ((q + 0.5 * h2(seed + 331 + wi, q)) / m) * TAU, k = h2(seed + 332 + wi, q), r = rk * (0.8 + 0.5 * k), x = wn.x + Math.cos(a) * (wn.rx + 0.55 * r), y = wn.y + Math.sin(a) * (wn.ry + 0.55 * r);
      lobes.push({ x, y, r, row: clamp(Math.floor((3 * (y - top)) / Math.max(1, bot - top)), 0, 2), k, kind: 3, edge: 1 });
    }
  });
  lobes.sort((a, b) => a.row - b.row || a.y - b.y);
  // ---- the box: every lobe, with a margin for the contour and the shadow's soft edge
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of lobes) { if (l.x - l.r < x0) x0 = l.x - l.r; if (l.x + l.r > x1) x1 = l.x + l.r; if (l.y - l.r < y0) y0 = l.y - l.r; if (l.y + l.r > y1) y1 = l.y + l.r; }
  const box = { x0: x0 - 4, x1: x1 + 4, y0: y0 - 4, y1: y1 + 4 };
  const reach = { x0: box.x0 - 8, x1: box.x1 + REACH.x, y0: box.y0 - 8, y1: box.y1 + REACH.y }; // what the bank's shadow can touch: down and to the right of the lobes
  return { lobes, windows: wins, box, reach, cx: (left + right) / 2, cy: (top + bot) / 2, r0, outline: o, puffs, cover: coverOf(lobes, box), touch: touchOf(lobes, box) };
}

/** The union of the lobes on a grid: { x0, y0, nx, ny, bits (Uint8Array, 1 where a cell's middle is inside some lobe) }. */
export function coverOf(lobes, box) {
  const c = FORM.cell, nx = Math.max(1, Math.ceil((box.x1 - box.x0) / c)), ny = Math.max(1, Math.ceil((box.y1 - box.y0) / c)), bits = new Uint8Array(nx * ny);
  for (const l of lobes) {
    const i0 = Math.max(0, Math.floor((l.x - l.r - box.x0) / c)), i1 = Math.min(nx - 1, Math.floor((l.x + l.r - box.x0) / c)), j0 = Math.max(0, Math.floor((l.y - l.r - box.y0) / c)), j1 = Math.min(ny - 1, Math.floor((l.y + l.r - box.y0) / c)), rr = l.r * l.r * 0.9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = box.x0 + (i + 0.5) * c - l.x, dy = box.y0 + (j + 0.5) * c - l.y; if (dx * dx + dy * dy <= rr) bits[j * nx + i] = 1; }
  }
  return { x0: box.x0, y0: box.y0, nx, ny, bits };
}
/**
 * The shadow's shape, shared by the painter (cloudpaint.js paintCloudShadow) and by `touchOf`, so a chunk is made exactly where something is painted: a broad soft ellipse under the whole bank (radii a half of the box's
 * width and 0.36 of its height, centred at 0.62 of its height) and a soft one under each lobe that `castsShadow` (radii 1.55 and 0.8 of the lobe's, centred half a radius down), all pushed by the light: `sx` 72 and
 * `sy` 36 world px a unit of shadowLength, which runs 0.5 by moonlight to 1.2 in the golden hours (so the push is 36 to 87 across and 18 to 44 down). `visible` is how far out a stamp's soft sprite is more than a trace.
 */
export const SHADOW = Object.freeze({ lobeRx: 1.55, lobeRy: 0.8, lobeDown: 0.5, broadRx: 0.5, broadRy: 0.36, broadAt: 0.62, sx: 72, sy: 36, sxMin: 36, sxMax: 87, syMin: 18, syMax: 44, visible: 0.8 });
/** Does a lobe throw a shadow of its own? The lobes of the middle and front tiers that are mass or towers, and a share of them (by their hash) so the foot of the bank is soft and not a row of discs. */
export const castsShadow = (l) => l.row >= 1 && l.kind <= 1 && l.k <= 0.6;
/**
 * Where the bank, with its shadow, could put a pixel: a coarse grid (blocks of TOUCH world px) with a bit for every block that a lobe, or the shadow of a lobe, or the broad shadow, can reach at any light of the day.
 * The chunk store asks it which cells are worth baking: a bank is a diamond in a rectangle, and the rectangle's empty corners, and the faint outskirts of the shadow, would be chunks of nothing.
 */
export const TOUCH = 96;
export function touchOf(lobes, box) {
  const S = SHADOW, nx = Math.max(1, Math.ceil((box.x1 + REACH.x - box.x0) / TOUCH)), ny = Math.max(1, Math.ceil((box.y1 + REACH.y - box.y0) / TOUCH)), bits = new Uint8Array(nx * ny);
  const mark = (xa, ya, xb, yb) => {
    const i0 = Math.max(0, Math.floor((xa - box.x0) / TOUCH)), i1 = Math.min(nx - 1, Math.floor((xb - box.x0) / TOUCH)), j0 = Math.max(0, Math.floor((ya - box.y0) / TOUCH)), j1 = Math.min(ny - 1, Math.floor((yb - box.y0) / TOUCH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bits[j * nx + i] = 1;
  };
  for (const l of lobes) {
    mark(l.x - l.r, l.y - l.r, l.x + l.r, l.y + l.r);
    if (castsShadow(l)) { const rx = l.r * S.lobeRx * S.visible, ry = l.r * S.lobeRy * S.visible, cy = l.y + l.r * S.lobeDown; mark(l.x + S.sxMin - rx, cy + S.syMin - ry, l.x + S.sxMax + rx, cy + S.syMax + ry); }
  }
  const w = box.x1 - box.x0, h = box.y1 - box.y0, rx = w * S.broadRx * S.visible + TOUCH * 0.75, ry = h * S.broadRy * S.visible + TOUCH * 0.75; // (the ellipse, a block's half diagonal wider: a block counts when its middle is inside)
  for (let t = 0; t <= 2; t++) {
    const cx = (box.x0 + box.x1) / 2 + S.sxMin + ((S.sxMax - S.sxMin) * t) / 2, cy = box.y0 + h * S.broadAt + S.syMin + ((S.syMax - S.syMin) * t) / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const dx = (box.x0 + (i + 0.5) * TOUCH - cx) / rx, dy = (box.y0 + (j + 0.5) * TOUCH - cy) / ry; if (dx * dx + dy * dy <= 1) bits[j * nx + i] = 1; }
  }
  return { x0: box.x0, y0: box.y0, nx, ny, bits };
}
/** Does the bank (lobes and shadow) touch the world rectangle [x0, x1] x [y0, y1]? Looks up the blocks the rectangle covers. */
export function touches(form, x0, y0, x1, y1) {
  const g = form.touch, i0 = Math.max(0, Math.floor((x0 - g.x0) / TOUCH)), i1 = Math.min(g.nx - 1, Math.floor((x1 - g.x0) / TOUCH)), j0 = Math.max(0, Math.floor((y0 - g.y0) / TOUCH)), j1 = Math.min(g.ny - 1, Math.floor((y1 - g.y0) / TOUCH));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (g.bits[j * g.nx + i]) return true;
  return false;
}
/** Is the world point (x, y) under the bank's cloud (0 or 1)? Outside the box, and inside a window, it is 0. */
export function coverAt(form, x, y) {
  const g = form.cover, c = FORM.cell, i = Math.floor((x - g.x0) / c), j = Math.floor((y - g.y0) / c);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? 0 : g.bits[j * g.nx + i];
}
/** The share of the district's footprint, as its outline on the screen, that the painted bank covers (sampled every `step` world px): what the player sees of the district is the rest. */
export function paintedCover(form, step = 16) {
  const o = form.outline; let all = 0, hit = 0;
  const top = Math.min(...o.map((q) => q[1])), bot = Math.max(...o.map((q) => q[1])), cx = (o[1][0] + o[3][0]) / 2, hw = (o[1][0] - o[3][0]) / 2;
  for (let y = top + step / 2; y < bot; y += step) {
    const t = Math.abs((y - (top + bot) / 2) / ((bot - top) / 2)), half = hw * (1 - t);
    for (let x = cx - half + step / 2; x < cx + half; x += step) { all++; if (coverAt(form, x, y)) hit++; }
  }
  return all ? hit / all : 0;
}

// ---------------------------------------------------------------- the sky's own clouds: a small cumulus of five to seven lobes on a flat base, two or three taller ones on top
/** The form of the small cloud of sky cell `k` (clouds.js skyCloudAt): { lobes, box, r0 } in world px about its own middle, made once per `k`. Pure. */
export function skyFormOf(k) {
  const n = 5 + ((h2(k, 95) * 3) | 0), lobes = [];
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5, r = 46 * (0.75 + 0.5 * Math.cos(u * 3.1)) * (0.85 + 0.3 * h2(k, 100 + i)); lobes.push({ x: u * 210, y: -r * 0.5 * (0.6 + 0.8 * h2(k, 110 + i)), r, row: 2, k: h2(k, 120 + i), kind: 0, edge: 1 }); }
  const tops = 2 + ((h2(k, 96) * 2) | 0);
  for (let i = 0; i < tops; i++) { const r = 34 + 14 * h2(k, 130 + i); lobes.push({ x: (h2(k, 135 + i) - 0.5) * 120, y: -52 - 22 * h2(k, 140 + i), r, row: 2, k: h2(k, 145 + i), kind: 1, edge: 1 }); }
  lobes.sort((a, b) => a.y - b.y);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of lobes) { if (l.x - l.r < x0) x0 = l.x - l.r; if (l.x + l.r > x1) x1 = l.x + l.r; if (l.y - l.r < y0) y0 = l.y - l.r; if (l.y + l.r > y1) y1 = l.y + l.r; }
  return { lobes, box: { x0: x0 - 4, x1: x1 + 10, y0: y0 - 4, y1: y1 + 12 }, r0: 46 };
}

/** How much of a light's reach, 0..1, the bank covers: five points (the light and four round it at half its radius) looked up in the cover grid. A lamp whose point is under cloud but that has clear sky at its side is half hidden. */
export function lightCover(form, x, y, r) {
  const h = r * 0.5; return (coverAt(form, x, y) + coverAt(form, x - h, y) + coverAt(form, x + h, y) + coverAt(form, x, y - h * 0.5) + coverAt(form, x, y + h * 0.5)) / 5;
}
