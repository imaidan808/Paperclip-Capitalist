// Cloud banks over locked districts and over one that is opening. LEGACY drawer (below): a dark pool and sliding blurred banks (lighting.js). The V2 drawer (registered here, flagged `clouds:v2`) is the cloud bank
// of docs/ART_DIRECTION.md section 6: lit puffy lobes with a soft belly and a thin contour, windows with rims of their own, a soft shadow on the land and the sea, a padlock, a dissolve when the district opens.
// How a bank is shaped is cloudform.js, how it is painted is cloudpaint.js, where its puffs stand and what the plan's rules hold is cloudbank.js; THIS file is the layer: it keeps the banks in chunks of device pixels
// (cloudcache.js), stamps them 1:1, and draws live only what moves (the dissolve, the padlocks, the sky's small clouds, the collar of a tower that stands out of its bank).
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md).
//
// The order of the frame is the order of the picture: every bank's shadow, every bank, then the tall props that stand out of them, then every padlock (a padlock is drawn over ALL the banks, so a neighbour's puff
// never buries one: judge F8). The chunks hold shadows and banks of the locked districts only; a district that is opening is drawn live for the length of its dissolve and leaves the chunks at once.
import { P, clamp, h2, toGrid } from './iso.js';
import { DIST, LAYOUT } from './layout.js';
import { registerLayer, runLayer } from './stack.js';
import { CLOUD } from './palette.js';
import { stampSoft } from './shadow.js';
import { bankOf, bankTones, paintLobes, paintCloudShadow, dissolveFx, fadeFx, lobeLift } from './cloudpaint.js';
import { skyFormOf, touches } from './cloudform.js';
import { CloudCache } from './cloudcache.js';
import { CHUNK_PX, scaleKey, chunkKey, cellsFor, chunksTouched } from './chunks.js';
import { surface, hasOffscreen, ledger, registerReleaser, LEDGER_LIMIT_MB } from './gfx.js';
export { BANK, bankPuffs, bankScale, bankMs, coverage, structure } from './cloudbank.js'; // the bank's geometry (docs/RENDER_PLAN.md T2): the V2 drawer is built on it, tests/world-cloudbank.test.mjs holds it to the plan
export { lobeLift };

export const cloudMethods = {
  /** Mist over locked districts and over one that is opening: a soft dark pool centred on the district, thickest at its heart, with slow banks of cloud (lighting.js). */
  drawFog(ctx, vz) {
    const t = this.vt;
    for (const id of vz) {
      const fx = this.fxOf(id); if (fx.fog <= 0.01) continue;
      const D = DIST[id], F = D.fp, [X, Y] = P(F[0] + F[2] / 2, F[1] + F[3] / 2, D.z + 24), R = (F[2] + F[3]) * 18;
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.62);
      this.light.fog(ctx, R, fx.fog, t, this.far);
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------- V2
export const COARSE_SCALE = 1.6, FINE_SCALE = 1;
/**
 * The lattice scale of the banks at a camera zoom: the fine bank from 0.30, the coarse one (about half the lobes, chunkier: at the whole-island view a fine bank's lobes are 15 pixels across and read as foam) below it.
 * Both have three windows, so the island's coast and roads read through the clouds at the whole-island view too. A pure function of the zoom.
 */
export const scaleAt = (zoom) => (zoom < 0.3 ? COARSE_SCALE : FINE_SCALE);
export const REVEAL_MS = 2600;                       // the engine's (world.js): how long a district takes to open
const NOFX = Object.freeze({ dim: 0, fog: 0, lights: 0 });
const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
const smoothstep = (x, a, b) => smooth((x - a) / (b - a));
const TAU = Math.PI * 2;

/** The padlock that floats on a bank: a gold rounded lock of 28 world px with a keyhole, bobbing 2 world px over 4 s, in a soft shadow of the cloud's blue so it stands off white. (x, y) is its centre. */
export function paintPadlock(ctx, x, y, t, a) {
  if (a < 0.02) return;
  const bob = t ? Math.sin(t / 4000 * 6.2832) * 2 : 0, prev = ctx.globalAlpha; y += bob;
  ctx.globalAlpha = prev * a * 0.5; ctx.fillStyle = CLOUD.shadow; ctx.beginPath(); ctx.ellipse(x + 3, y + 22, 15, 5, 0, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = prev * a;
  ctx.lineCap = 'round'; ctx.lineWidth = 5.5; ctx.strokeStyle = '#a8742a'; ctx.beginPath(); ctx.arc(x, y - 4, 8.4, Math.PI, 0); ctx.lineTo(x + 8.4, y + 2); ctx.moveTo(x - 8.4, y - 4); ctx.lineTo(x - 8.4, y + 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y - 4, 8.4, Math.PI, 0); ctx.moveTo(x + 8.4, y - 4); ctx.lineTo(x + 8.4, y + 2); ctx.moveTo(x - 8.4, y - 4); ctx.lineTo(x - 8.4, y + 2); ctx.stroke();
  const rr = (X, Y, W, H, R) => { ctx.beginPath(); ctx.moveTo(X + R, Y); ctx.arcTo(X + W, Y, X + W, Y + H, R); ctx.arcTo(X + W, Y + H, X, Y + H, R); ctx.arcTo(X, Y + H, X, Y, R); ctx.arcTo(X, Y, X + W, Y, R); ctx.closePath(); };
  ctx.fillStyle = '#d99a22'; rr(x - 14, y - 2, 28, 22, 6); ctx.fill();
  ctx.fillStyle = '#ffd84d'; rr(x - 14, y - 2, 26, 18, 6); ctx.fill();
  ctx.fillStyle = '#fff0a8'; rr(x - 11, y, 14, 4, 2); ctx.fill();
  ctx.fillStyle = '#7a4a12'; ctx.beginPath(); ctx.arc(x, y + 7, 3.2, 0, 6.2832); ctx.fill(); rr(x - 1.6, y + 8, 3.2, 6, 1.4); ctx.fill();
  ctx.globalAlpha = prev;
}

/** Tall things that stand out of the cloud: the towers, the IPO tower and the cranes (kinds taller than the dome) drawn again over it, above the line the dome reaches, in their own colour, with a collar of lobes where they leave it. */
const TALL = new Set(['tower', 'ipo', 'crane']);
const DOME = 66;
const COLLAR = [{ x: 0, y: 0, r: 0, row: 2, k: 0.2, kind: 0, edge: 1 }, { x: 0, y: 0, r: 0, row: 2, k: 0.4, kind: 0, edge: 1 }, { x: 0, y: 0, r: 0, row: 2, k: 0.6, kind: 0, edge: 1 }];
function pokeOut(ctx, view, w, D, tones, a, zoom, m) {
  if (a < 0.5 || zoom < 0.55) return;
  const f = w.fxOf, own = Object.hasOwn(w, 'fxOf'), hits = w.hits.length, over = w.overlay.length, lit = w.lights.length;
  for (const p of D.props) {
    if (!TALL.has(p.t) || p.h < DOME + 14) continue;
    const bx = (p.gx - p.gy) * 32 + 0, by = (p.gx + p.gy + p.w) * 16 - p.z;
    if (bx < view.x0 - 80 || bx > view.x1 + 80 || by < view.y0 || by - p.h > view.y1) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(view.x0, view.y0 - 400, view.x1 - view.x0, by - DOME - (view.y0 - 400)); ctx.clip();
    w.fxOf = () => NOFX; try { runLayer('static', w, ctx, view, p); } finally { if (own) w.fxOf = f; else delete w.fxOf; }
    ctx.restore();
    w.hits.length = hits; w.overlay.length = over; w.lights.length = lit; // the frame pushes the hit and the labels of a prop: they are the first drawing's
    const r = 22 + p.w * 4, cy = by - DOME + 4; let n = 0;
    for (const [dx, dy, k] of [[-0.55, 0.1, 0.8], [0.5, 0.15, 0.9], [0, -0.25, 0.7]]) { const c = COLLAR[n++]; c.x = bx + dx * r; c.y = cy + dy * r; c.r = r * k; }
    paintLobes(ctx, COLLAR, { a: m.a, e: m.e, f: m.f, tones, r0: r, top: cy - r, bot: cy + r, view: null, lite: true });
  }
}

// ---------------------------------------------------------------- the sky's own clouds: small cumulus that drift over the sea at the far and middle zooms, each with its soft shadow on the water
/** A sky cell is this many world px on a side; each holds at most one small cloud, which crosses it from west to east in about five minutes and fades in and out at its ends. */
export const SKY_CELL = 2600;
const SKY_SPEED = 8;     // world px a second
/** Is there a small cloud in sky cell (cx, cy), and where is it at time t (ms)? Fills `out` { x, y, a (0..1: its fade), size (0.8..1.3), k } or answers false for an empty cell. Pure. */
export function skyCloudAt(cx, cy, t, out) {
  const k = cx * 877 + cy * 1361; if (h2(k, 91) > 0.55) return false;
  const u = (((t / 1000) * SKY_SPEED) / SKY_CELL + h2(k, 92)) % 1;
  out.x = (cx + u) * SKY_CELL; out.y = (cy + 0.2 + 0.6 * h2(k, 93)) * SKY_CELL * 0.62; out.a = Math.min(1, Math.sin(u * Math.PI) * 2.2); out.size = 0.8 + 0.5 * h2(k, 94); out.k = k; return out;
}
const SKY_FORMS = new Map(), SKY_SPRITES = new Map(), SKY_MAX = 48;
const skyForm = (k) => { let f = SKY_FORMS.get(k); if (!f) { f = skyFormOf(k); if (SKY_FORMS.size > 128) SKY_FORMS.clear(); SKY_FORMS.set(k, f); } return f; };
/** The sprite of a small cloud at scale `s` (device pixels a world pixel, quantised to a quarter octave so a slow zoom does not bake one a frame) for the light `tones`: { c, q } or null with no surfaces. */
function skySprite(k, s, tones) {
  const q = Math.round(Math.log2(Math.max(s, 0.05)) * 4), key = (k * 64 + q) * 256 + tones.key; let sp = SKY_SPRITES.get(key);
  if (sp) { SKY_SPRITES.delete(key); SKY_SPRITES.set(key, sp); return sp; }
  const f = skyForm(k), aq = Math.pow(2, q / 4), w = Math.ceil((f.box.x1 - f.box.x0) * aq), h = Math.ceil((f.box.y1 - f.box.y0) * aq), surf = surface(w, h); if (!surf) return null;
  paintLobes(surf.g, f.lobes, { a: aq, e: -f.box.x0 * aq, f: -f.box.y0 * aq, tones, r0: f.r0, top: f.box.y0, bot: f.box.y1, view: null, lite: false });
  sp = { c: surf.c, aq, w, h }; SKY_SPRITES.set(key, sp); if (SKY_SPRITES.size > SKY_MAX) SKY_SPRITES.delete(SKY_SPRITES.keys().next().value);
  let bytes = 0; for (const v of SKY_SPRITES.values()) bytes += v.w * v.h * 4; ledger.register('cloud.sky', bytes);
  return sp;
}
const SKYO = { x: 0, y: 0, a: 0, size: 1, k: 0 };
function paintSky(ctx, view, env, w, zoom, tones, t, m) {
  const fade = 1 - smoothstep(zoom, 0.55, 0.9); if (fade < 0.03) return;
  const x0 = Math.floor(view.x0 / SKY_CELL) - 1, x1 = Math.floor(view.x1 / SKY_CELL) + 1, y0 = Math.floor(view.y0 / (SKY_CELL * 0.62)) - 1, y1 = Math.floor(view.y1 / (SKY_CELL * 0.62)) + 1, prev = ctx.globalAlpha;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    if (!skyCloudAt(cx, cy, t, SKYO)) continue; const { x, y, a, size, k } = SKYO; if (a < 0.03 || x < view.x0 - 200 || x > view.x1 + 200 || y < view.y0 - 200 || y > view.y1 + 200) continue;
    const [gx, gy] = toGrid(x, y, 0); if (LAYOUT.isLand(Math.floor(gx), Math.floor(gy))) continue; // over the sea only: it never covers what the player is looking at
    ctx.globalAlpha = prev * a * fade * 0.55; stampSoft(ctx, x + 70 * size, y + 62 * size, 150 * size, 38 * size, 0.5, tones.shade);
    ctx.globalAlpha = prev * a * fade * 0.94;
    const f = skyForm(k), oy = y - 70 * size, sp = skySprite(k, m.a * size, tones);
    if (sp) ctx.drawImage(sp.c, x + f.box.x0 * size, oy + f.box.y0 * size, (f.box.x1 - f.box.x0) * size, (f.box.y1 - f.box.y0) * size);
    else { paintLobes(ctx, f.lobes, { a: m.a * size, e: m.e + m.a * x, f: m.f + m.a * oy, tones, r0: f.r0, top: f.box.y0, bot: f.box.y1, view: null, lite: false }); ctx.setTransform(m.a, 0, 0, m.a, m.e, m.f); }
  }
  ctx.globalAlpha = prev;
}

// ---------------------------------------------------------------- the banks in chunks
const REST_MS = 90, FADE_MS = 140, BAKE_MS = [12, 7];
const FORCE_MARGIN = 60; // world px round the reach of a bank whose district changed state: the soft cut (FEATHER, below) it makes in a neighbour's bank reaches about this far
/**
 * The share of the frame's scale the clouds are baked at, by what the pixel ledger can spare. 1 is the rule: a chunk is baked at the frame's own scale and stamped 1:1 on whole pixels, which is the cheap blit (about
 * 0.7 ms a megapixel on a CPU-drawn canvas; a scaled one is 4). Only when the window's cells at 1 would not fit in what the ledger has left under its ceiling do the clouds fall back, to 0.75 (stamped 4/3 larger: a chunk
 * of 384 pixels lands on exactly 512 of the frame's) and then to 0.5: a cloud is soft, its one hard line is a contour of a pixel and a half, and a window wholly under cloud is 54 chunks (32 MB) at 1, 35 (21 MB) at 0.75
 * and 20 (12 MB) at 0.5. `cells1` is the number of chunks the window needs at 1, `room` the bytes the ledger can still give the clouds, `was` the ratio in force (a hysteresis: going back up wants 8 MB to spare).
 * A far bank (a scale of 0.8 or less) is always 1: it is a few chunks.
 */
export const RATIOS = Object.freeze([1, 0.75, 0.5]);
export function ratioFor(a, cells1, room, was = 1) {
  if (a <= 0.8) return 1;
  const need = (q) => (Math.ceil(cells1 * q * q) + 4) * CHUNK_PX * CHUNK_PX * 4;
  if (need(1) <= room - (was < 1 ? 8e6 : 0)) return 1;
  if (need(0.75) <= room - (was < 0.75 ? 6e6 : 0)) return 0.75;
  return 0.5;
}
/** The share of the ledger's ceiling the clouds may bring it to (a little under it: the ledger's own readings are every couple of seconds). */
export const CLOUD_CEILING = 0.985;
/** The most chunks the cloud store keeps: what the window touches at the baked scale and four more (the stale ones that stand in while a zoom settles). The ground keeps 1.35 times what it touches; the clouds hold only what is under the window. */
export const cloudCap = (w, h, dpr, q = 1) => chunksTouched(w * q, h * q, dpr) + 4;
const ST = new WeakMap(), STORES = new Set();
registerReleaser(() => { for (const s of STORES) s.release(); SKY_SPRITES.clear(); ledger.release('cloud.sky'); });
const stateOf = (w) => {
  let st = ST.get(w);
  if (!st) {
    st = { store: null, banks: [], tones: null, night: 0, dusk: 0, a: 0, at: -1e9, mask: -1, cells: {}, miss: [], win: { x0: 0, x1: 0, y0: 0, y1: 0 }, seen: 0, ticks: 0, q: 1, m: { a: 1, e: 0, f: 0 }, live: [], want: [], open: [], force: [], part: [], holes: 0 };
    st.draw = (g, a, e, f, view) => { // what a chunk is painted with: the shadows of every bank that reaches it, then the banks
      const { banks, tones, night, dusk } = st;
      g.setTransform(a, 0, 0, a, e, f);
      for (const b of banks) if (!(b.reach.x1 < view.x0 || b.reach.x0 > view.x1 || b.reach.y1 < view.y0 || b.reach.y0 > view.y1)) paintCloudShadow(g, b, { tones, night, dusk, alpha: 1, view });
      for (const b of banks) if (!(b.box.x1 < view.x0 || b.box.x0 > view.x1 || b.box.y1 < view.y0 || b.box.y0 > view.y1)) paintLobes(g, b.lobes, { a, e, f, tones, r0: b.r0, top: b.box.y0, bot: b.box.y1, view });
      clearOpen(g, st.open); // the open districts stand clear of every bank
    };
    ST.set(w, st);
  }
  return st;
};
/** The set of districts under cloud as a bit mask (district id 1 to 16 is bit id), from the world's set of open ones: a world that does not know yet has every district open. */
export function lockedMask(unlocked) { let m = 0; if (unlocked) for (const id of LAYOUT.ids) if (!unlocked.has(id)) m |= 1 << id; return m; }
const byY = (p, q) => p.cy - q.cy;
/**
 * An open district is never under its neighbours' clouds. A bank's puffs are a hundred world px across at the far scales and spill over the block beside it, which buried the player's own district (the Scrap Yard's
 * crates, roof and crane at the island's fit view: the first judge pass). The footprints of the open districts (block and pavement, in world px) are cut out of what is baked, with a soft edge: wide faint strokes
 * outwards, then the footprint whole. Only at the coarse and far lattices (`ps` above 1), where the puffs are that big: a fine bank hugs its own block, and at the working zoom a straight cut through a puff shows. Only ever on a chunk's own surface: the live path (no surfaces: the Node tests) paints on the frame itself, where cutting would cut the ground.
 */
const OPEN_POLY = new Map();
const openPoly = (D) => { let p = OPEN_POLY.get(D.id); if (!p) { const [x, y, w, d] = D.fp; OPEN_POLY.set(D.id, p = [P(x, y, D.z), P(x + w, y, D.z), P(x + w, y + d, D.z), P(x, y + d, D.z)]); } return p; };
export const FEATHER = Object.freeze([[104, 0.08], [78, 0.1], [56, 0.14], [38, 0.18], [22, 0.24], [10, 0.32]]); // [line width in world px, alpha]: the edge fades over about 50 px outside the footprint
export function clearOpen(g, open) {
  if (!open || !open.length) return;
  g.save(); g.globalCompositeOperation = 'destination-out'; g.lineJoin = 'round';
  for (const poly of open) {
    const trace = () => { g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]); g.closePath(); };
    for (const [lw, al] of FEATHER) { g.globalAlpha = al; g.lineWidth = lw; trace(); g.stroke(); }
    g.globalAlpha = 1; trace(); g.fill();
  }
  g.restore();
}
/** The chunk store's counters for the rig and the tests: { baked, ms, lastMs, hits, stale, faded, dropped, size, bytes, ratio, holes } (null before the first bank is baked; `holes`: the pieces of the banks that nothing covered in the last frame). */
export function cloudStats(w) { const st = ST.get(w); return st && st.store ? { ...st.store.stats, size: st.store.size, bytes: st.store.bytes, ratio: st.q, holes: st.holes | 0 } : null; }
/** The world's cloud chunk store (the rig and the tests read it; null before the first bank is baked). */
export function cloudStore(w) { const st = ST.get(w); return st && st.store ? st.store : null; }
/** Give some of the clouds' chunks back when the pixel ledger is over its ceiling (World.squeeze): the stale ones and the ones outside the window first, down to 70% of what is held; the visible exact ones are never dropped. Answers how many went. */
export function shrinkClouds(w) { const st = ST.get(w); if (!st || !st.store || !st.store.size) return 0; return st.store.shrink(Math.max(8, Math.ceil(st.store.size * 0.7)), st.cells, st.a); }

/** The chunk cells of the window at a chunk scale `ac` that some bank (lobes or shadow) can touch, as i, j pairs pushed to `out` (cleared first). Answers the number of cells. */
function wantedCells(banks, win, ac, cellsObj, out) {
  const cells = cellsFor(win, ac, cellsObj), s = cells.s; out.length = 0;
  for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) {
    for (const b of banks) { const r = b.reach; if (!(r.x1 < i * s || r.x0 > (i + 1) * s || r.y1 < j * s || r.y0 > (j + 1) * s) && touches(b, i * s, j * s, (i + 1) * s, (j + 1) * s)) { out.push(i, j); break; } }
  }
  return out.length >> 1;
}
const SCRATCH = { cells: {}, want: [] };
/**
 * The banks of the locked districts, stamped from chunks of this frame's render scale: a chunk is the cell (i, j) of the scale's grid (the ground's own grid), baked once with every shadow and bank that reaches it
 * (cloudcache.js), stamped 1:1 on whole pixels. The chunks a pan reveals are baked a few milliseconds a frame; while the zoom moves, chunks of the nearest scales stand in, scaled, and the exact scale is baked
 * as soon as the zoom rests and fades in over them; a district that opens leaves the chunks at once (the cells it was in are baked again in that frame, so the dissolve never plays over a bank that is still there).
 */
function stampBanks(ctx, w, st, ids, tones, ps) {
  const { W, H, dpr } = w, store = st.store, a = w.renderScale(), snap = w.snap, e = snap[0], f = snap[1], cw = w.cv.width, ch = w.cv.height, now = performance.now();
  const banks = st.banks; banks.length = 0; for (const id of ids) banks.push(bankOf(DIST[id], ps)); banks.sort(byY);
  const win = st.win; win.x0 = -e / a; win.x1 = (cw - e) / a; win.y0 = -f / a; win.y1 = (ch - f) / a;
  // ---- the ratio: the frame's own scale unless the ledger has no room for the window's chunks at it (ratioFor). The ledger is read as it is: the world tells it about its canvas and light layers on a resize and every
  // ninety frames, so a world that has been still, or a rig that draws by hand, is asked to bring it up to date every sixteenth frame (a sum over a few dozen surfaces).
  if (!(st.ticks++ & 15) && w.ledgerSync) w.ledgerSync();
  const room = LEDGER_LIMIT_MB * 1e6 * CLOUD_CEILING - (ledger.total() - ledger.total(store.name)), q = ratioFor(a, a <= 0.8 ? 0 : wantedCells(banks, win, a, SCRATCH.cells, SCRATCH.want), room, st.q), ac = a * q, sk = scaleKey(ac);
  const kk = a / ac, D = Math.abs(CHUNK_PX * kk - Math.round(CHUNK_PX * kk)) < 1e-3 ? Math.round(CHUNK_PX * kk) : CHUNK_PX * kk; // a chunk's side on the frame: 384, or exactly 512 at the ratio 3/4
  st.tones = tones; st.night = (tones.key & 15) / 8; st.dusk = (tones.key >> 4) / 8;
  const open = st.open; open.length = 0; if (ps > 1 && w.unlocked) for (const id of LAYOUT.ids) if (w.unlocked.has(id)) open.push(openPoly(DIST[id]));
  const mask = lockedMask(w.unlocked), ver = mask | (tones.key << 17) | (((dpr * 4) | 0) << 25), changed = store.markStale(ver), was = st.mask; st.mask = mask;
  // The cells that a district opening must have made again in this frame: those its bank (and the soft cut it makes in its neighbours', the feather) can reach, so the dissolve never plays over a bank that is still in the chunks. The
  // other cells are stale too (the light of the hour changed their key) but are the same picture until the next few frames replace them, one chunk at a time, with the stale ones on show. A first frame makes every cell (below).
  const fr = st.force; fr.length = 0;
  if (changed && mask !== was && was >= 0) for (const id of LAYOUT.ids) if ((mask ^ was) & (1 << id)) { const r = bankOf(DIST[id], ps).reach; fr.push(r.x0 - FORCE_MARGIN, r.y0 - FORCE_MARGIN, r.x1 + FORCE_MARGIN, r.y1 + FORCE_MARGIN); }
  if (ac !== st.a) { st.a = ac; st.at = now; }
  const rig = typeof window !== 'undefined' && !!window.__rig, zooming = now - st.at < (w.gcRest ?? REST_MS), fadeMs = w.reduced() ? 0 : (w.gcFade ?? FADE_MS);
  wantedCells(banks, win, ac, st.cells, st.want); const cells = st.cells, s = cells.s, cx = (cw / 2 - e) / a, cy = (ch / 2 - f) / a, want = st.want;
  if (changed) { const keep = new Set(); for (let n = 0; n < want.length; n += 2) keep.add(chunkKey(sk, want[n], want[n + 1])); for (const c of [...store.map.values()]) if (c.stale && c.sk === sk && !keep.has(chunkKey(c.sk, c.i, c.j))) store.drop(c); } // (a stale chunk of a cell no bank reaches any more has nothing to stand for)
  const forced = (i, j) => { for (let p = 0; p < fr.length; p += 4) if ((i + 1) * s > fr[p] && i * s < fr[p + 2] && (j + 1) * s > fr[p + 1] && j * s < fr[p + 3]) return true; return false; };
  // ---- which wanted cells are not baked at the exact scale, and bake what the budget allows (the nearest to the middle of the window first)
  const miss = st.miss; miss.length = 0; let baked = 0; const all = rig || store.size === 0, pts = []; store.begin();
  for (let n = 0; n < want.length; n += 2) { const c0 = store.map.get(chunkKey(sk, want[n], want[n + 1])); if (!c0 || c0.stale) pts.push([want[n], want[n + 1], Math.hypot((want[n] + 0.5) * s - cx, (want[n + 1] + 0.5) * s - cy)]); }
  const bare = st.part;
  if (pts.length) {
    pts.sort((p, q2) => p[2] - q2[2]); const budget = st.seen >= 1 ? (w.gcBudget?.[0] ?? BAKE_MS[0]) : (w.gcBudget?.[1] ?? BAKE_MS[1]), t0 = performance.now();
    store.standIns(ac, sk, now);
    // COVER FIRST (as the ground's): a cell that no stand-in covers is made coarse (about half the scale, four cells to a chunk) before any exact chunk, unless every cell is made in this frame anyway, the budget is the whole window's
    // (a test), or the canvas is held back (the veil: nobody sees the clouds being made)
    const cover = !all && budget < 1e6 && !w.veilHold; let bareLeft = false;
    if (cover) { const ab = Math.round(Math.pow(2, Math.round(Math.log2(ac) * 4) / 4 - 0.9) * 1e5) / 1e5; bareLeft = store.cover(pts, s, win, sk, ac, now, ab, (ci, cj) => { const c = store.bake(st.draw, ab, ci, cj, true); if (c) baked++; return c; }, () => baked === 0 || performance.now() - t0 < budget); }
    for (const [i, j] of pts) {
      if (forced(i, j) || (!zooming && !bareLeft && (all || baked === 0 || performance.now() - t0 < budget))) {
        const c = store.bake(st.draw, ac, i, j);
        if (c) { baked++; bare.length = 0; if (fadeMs > 0 && store.list.length && !store.bareOf(i, j, s, bare, win)) c.fadeEnd = performance.now() + fadeMs; continue; } // (no fade over a stand-in that leaves part of the cell bare: the fade would run over the land with no cloud)
      }
      miss.push(i, j);
    }
  }
  // ---- stamp: the chunk of any other scale that has what no stand-in covers (soft), the stale stand-ins (not where an exact chunk goes, unless that chunk is still fading in), then the exact chunks on whole pixels
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const X = (i) => i * D + e, Y = (j) => j * D + f, tNow = performance.now(); let fading = 0, holes = 0;
  for (let n = 0; n < want.length; n += 2) { const c = store.map.get(chunkKey(sk, want[n], want[n + 1])); if (c && c.fadeEnd) { if (c.fadeEnd > tNow) fading++; else c.fadeEnd = 0; } }
  if (miss.length || fading) {
    const L = store.standIns(ac, sk, tNow);
    bare.length = 0; for (let n = 0; n < want.length; n += 2) { const ex = store.map.get(chunkKey(sk, want[n], want[n + 1])); if (!ex || ex.fadeEnd > tNow) store.bareOf(want[n], want[n + 1], s, bare, win); }
    if (bare.length) { store.soften(ctx, bare, a, e, f); holes = bare.length >> 2; }
    if (L.length) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch);
      for (let n = 0; n < want.length; n += 2) { const c = store.map.get(chunkKey(sk, want[n], want[n + 1])); if (c && !(c.fadeEnd > tNow) && !c.stale) ctx.rect(X(want[n]), Y(want[n + 1]), D, D); }
      ctx.clip('evenodd');
      for (const c of L) {
        const k2 = a / c.a, dx = c.i * CHUNK_PX * k2 + e, dy = c.j * CHUNK_PX * k2 + f, sz = CHUNK_PX * k2;
        if (dx + sz + k2 < 0 || dy + sz + k2 < 0 || dx - k2 > cw || dy - k2 > ch) continue;
        if (c.empty || store.hidden(c, sk, s)) { c.last = ++store.tick; continue; } store.use(c); ctx.drawImage(c.img, dx - k2 * 0.5, dy - k2 * 0.5, sz + k2, sz + k2);
      }
      ctx.restore(); store.stats.stale += L.length;
    }
  }
  for (let n = 0; n < want.length; n += 2) {
    const i = want[n], j = want[n + 1], c = store.get(sk, i, j); if (!c) continue;
    if (c.fadeEnd > tNow) { const t = 1 - (c.fadeEnd - tNow) / fadeMs; ctx.globalAlpha = t * t * (3 - 2 * t); ctx.drawImage(c.img, X(i), Y(j), D, D); ctx.globalAlpha = 1; store.stats.faded++; continue; }
    ctx.drawImage(c.img, X(i), Y(j), D, D); store.stats.hits++;
  }
  ctx.restore(); if (fading) w.dirty = true; // (a fade is a few frames of its own: the loop keeps drawing until it is over)
  st.seen = w.moving ? 0 : st.seen + 1; st.holes = holes; if (miss.length) w.gcMore = true; // (the loop does not sleep on clouds that are not whole)
  st.q = q; { const cap = cloudCap(W, H, dpr, q); store.sweep(cells, ac, cap, performance.now(), Math.ceil(cap * 1.25), !miss.length && !zooming && !fading); } // every frame: what the window no longer shows, or no longer needs to stand in for, is given back at once (the ledger holds the clouds to a share of the plan's memory); a stand-in on show is kept past the cap, up to a fifth more
  return miss.length === 0;
}

const NOSNAP = [0, 0];
const SEEN = new WeakMap(); // per world: the districts it has drawn under cloud, and when each was last seen opening (for the reduced-motion cross-fade)
const IDS = [], LIVE = [], LOCK = new Array(40).fill(0); // LOCK[id]: how strongly district id's padlock shows this frame
function drawClouds(ctx, view, env, w, vz) {
  const zoom = w.cam.z, t = env.t, calm = w.reduced(), warm = Math.min(1, (w.dusk || 0) * 1.1), cool = Math.min(1, env.night || 0), tones = bankTones(warm, cool), ps = scaleAt(zoom), a = w.renderScale ? w.renderScale() : zoom * (w.dpr || 1), snap = w.snap || NOSNAP, st = stateOf(w), m = st.m;
  m.a = a; m.e = snap[0]; m.f = snap[1];
  paintSky(ctx, view, env, w, zoom, tones, t, m);
  let seen = SEEN.get(w); if (!seen) SEEN.set(w, seen = new Map());
  // ---- which banks are in the chunks (locked) and which are drawn live (opening, or cross-fading under reduced motion)
  const ids = IDS; ids.length = 0; const live = LIVE; live.length = 0; LOCK.fill(0);
  if (w.unlocked) for (const id of LAYOUT.ids) if (!w.unlocked.has(id)) ids.push(id);
  for (const id of vz) {
    const D = DIST[id]; let fx = w.fxOf(id), dis = null, al = fx.fog;
    if (fx.fog > 0.01) seen.set(id, -1);                                              // locked (or opening): remembered
    else if (calm && seen.has(id)) { // opened while motion is reduced: the engine has no reveal then, so the bank cross-fades out in 400 ms of the world's own clock
      let t0 = seen.get(id); if (t0 < 0) { t0 = w.t; seen.set(id, t0); } const k = (w.t - t0) / 400;
      if (k >= 1) { seen.delete(id); continue; } al = 1 - k; fx = { dim: 0, fog: al, lights: 0 }; w.dirty = true;
    } else { if (seen.has(id)) seen.delete(id); continue; }
    const rv = w.reveal[id]; if (rv && !calm) { const ms = w.t - rv.t0; if (ms >= 0) { const g = D.gateAt || { x: D.cx, y: D.cy }, [gx, gy] = P(g.x, g.y, D.z); dis = { ms, gx, gy, span: (D.fp[2] + D.fp[3]) * 32 }; al = 1; } }
    const locked = !(w.unlocked && w.unlocked.has(id)) && !dis; LOCK[id] = dis ? 0 : al; if (!locked) live.push({ id, D, al, dis });
  }
  // ---- the locked banks: baked, stamped. Without surfaces (the Node tests) they are painted straight onto the frame, shadows first
  if (ids.length) {
    if (hasOffscreen() && w.cv && w.cv.width > 0) { st.store ||= (() => { const s = new CloudCache(); STORES.add(s); return s; })(); stampBanks(ctx, w, st, ids, tones, ps); }
    else {
      const night = (tones.key & 15) / 8, dusk = (tones.key >> 4) / 8;
      for (const id of ids) { const b = bankOf(DIST[id], ps); if (!(b.reach.x1 < view.x0 || b.reach.x0 > view.x1 || b.reach.y1 < view.y0 || b.reach.y0 > view.y1)) paintCloudShadow(ctx, b, { tones, night, dusk, alpha: 1, view }); }
      for (const id of ids) { const b = bankOf(DIST[id], ps); if (!(b.box.x1 < view.x0 || b.box.x0 > view.x1 || b.box.y1 < view.y0 || b.box.y0 > view.y1)) paintLobes(ctx, b.lobes, { a, e: m.e, f: m.f, tones, r0: b.r0, top: b.box.y0, bot: b.box.y1, view }); }
    }
    w.toWorld(ctx);
  }
  // ---- the banks that are opening, live: their shadow thins, their lobes lift away from the gate
  for (const L of live) {
    const { D, dis, al } = L, b = bankOf(D, ps); if (b.box.x1 + 80 < view.x0 || b.box.x0 - 30 > view.x1 || b.box.y1 + 30 < view.y0 || b.box.y0 - 30 > view.y1) continue;
    paintCloudShadow(ctx, b, { tones, night: cool, dusk: warm, alpha: dis ? 1 - smoothstep(dis.ms, 300, 1800) : al, view });
    paintLobes(ctx, b.lobes, { a, e: m.e, f: m.f, tones, r0: b.r0, top: b.box.y0, bot: b.box.y1, view, fx: dis ? dissolveFx(dis) : fadeFx(al) });
  }
  // ---- the tall things that stand out of their banks, then the padlocks over every bank
  for (const id of vz) if (LOCK[id] >= 0.999) pokeOut(ctx, view, w, DIST[id], tones, 1, zoom, m);
  const lockA = smoothstep(zoom, 0.48, 0.56); // (a padlock half faded is a ghost on the cloud: it comes in over a short band of zoom, and the name plates carry the lock below it)
  if (lockA > 0.06) for (const id of vz) { if (!(LOCK[id] > 0.02)) continue; const D = DIST[id], [lx, ly] = P(D.cx, D.cy, D.z + 96); paintPadlock(ctx, lx, ly, t, lockA * LOCK[id]); }
}
registerLayer('clouds', drawClouds, 'world');
