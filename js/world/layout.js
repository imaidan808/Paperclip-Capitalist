// The island: three elevated districts along one avenue, plus every slot where game objects appear.
// Pure data and deterministic scatter: tweak the tables below to re-lay the world.
import { h2, hash, lerp } from './iso.js';

export const GW = 36, GH = 50;                         // grid size (tiles)
export const LAND = { x0: 3, x1: 33, y0: 1, y1: 49 };   // land rectangle: x0 <= gx < x1, y0 <= gy < y1
export const AVENUE = [17, 19];                         // gx range of the central avenue (two tiles)
export const STREETS = [7, 24, 40];                     // gy rows of the cross streets
export const ELEV = { 1: 0, 2: 12, 3: 26 };

export const zoneAt = (gy) => (gy < 16 ? 3 : gy < 32 ? 2 : 1);
/** Ground height in px. Flat inside districts, sloped ramps between them. */
export function zAt(gy) {
  if (gy <= 15) return ELEV[3];
  if (gy < 18) return lerp(ELEV[3], ELEV[2], (gy - 15) / 3);
  if (gy <= 31) return ELEV[2];
  if (gy < 34) return lerp(ELEV[2], ELEV[1], (gy - 31) / 3);
  return ELEV[1];
}
export const inLand = (gx, gy) => gx >= LAND.x0 && gx < LAND.x1 && gy >= LAND.y0 && gy < LAND.y1;
export const isAvenue = (gx, gy) => gx >= AVENUE[0] && gx < AVENUE[1] && gy >= LAND.y0 && gy < LAND.y1;
export const isStreet = (gx, gy) => STREETS.includes(Math.floor(gy)) && gx >= 4 && gx < 32;
export const isRoad = (gx, gy) => isAvenue(gx, gy) || isStreet(gx, gy);
export const isWalk = (gx, gy) => !isRoad(gx, gy) && zoneAt(gy) > 1 && (isRoad(gx - 1, gy) || isRoad(gx + 1, gy) || isRoad(gx, gy - 1) || isRoad(gx, gy + 1));

export const DIST = {
  1: { id: 1, cx: 18, cy: 41, name: 'The Scrap Yard', gy0: 34, gy1: 48 },
  2: { id: 2, cx: 18, cy: 24, name: 'The Metro Hub', gy0: 18, gy1: 32 },
  3: { id: 3, cx: 18, cy: 8, name: 'Corporate Valley', gy0: 2, gy1: 16 },
};

// ---- buildings and landmarks (footprint rects: [gx, gy, w, d]); hot = interaction id
export const BUILD = {
  1: { hq: [5, 43.5, 3, 2.5], depot: [26, 44, 4, 3], board: [12, 33.8, 3, 0.5] },
  2: { bank: [21, 19, 5, 4], audit: [28, 19, 3, 3], hq: [13, 19, 3, 3], depot: [13, 27, 3, 3], board: [27, 23.2, 3, 0.5] },
  3: { ipo: [22, 2.6, 4, 4], hq: [28.4, 2.6, 3, 3], depot: [13, 12.6, 3, 2], board: [19.8, 5.6, 3, 0.5] },
};

// ---- pipeline plots (3x3 each)
export const PLOTS = {
  2: [[5, 19], [9, 19], [5, 27], [9, 27]],
  3: [[5, 3], [9, 3], [13, 3], [5, 9], [9, 9], [13, 9]],
};

// ---- object slots: where leads, lots and stored assets stand
export const SPOTS = {
  1: {
    leads: [[8.5, 40.8], [11.5, 42.8], [14.5, 41.4], [13.5, 45.6], [21.5, 42.2], [24.5, 43.4], [28, 41.6], [31, 43]],
    lots: Array.from({ length: 6 }, (_, i) => [6.4 + i * 1.9, 35.9]),
    stash: { x: 21.6, y: 36.4, cols: 5, dx: 1.9, dy: 1.7, n: 10 },
    home: [8.8, 46.2],
  },
  2: {
    leads: [[19.6, 24.6], [22, 24.5], [24.6, 24.6], [27.2, 24.5], [29.8, 24.6], [14.5, 25.6], [12.5, 23.4], [16, 22.8]],
    lots: Array.from({ length: 6 }, (_, i) => [20.4 + i * 2.0, 23.6]),
    stash: { x: 20.4, y: 26.2, cols: 6, dx: 1.75, dy: 1.3, n: 18 },
    home: [16.5, 20.8],
  },
  3: {
    leads: [[19.8, 7.5], [22, 7.5], [24.2, 7.5], [26.4, 7.5], [28.6, 7.5], [30.8, 7.5], [27, 6.3], [29.6, 6.3]],
    lots: Array.from({ length: 6 }, (_, i) => [19.8 + i * 2.1, 10.7]),
    stash: { x: 19.6, y: 11.9, cols: 10, dx: 1.25, dy: 1.15, n: 30 },
    home: [21.6, 9.3],
  },
};
export const stashPos = (z, i) => {
  const s = SPOTS[z].stash;
  if (i < s.n) return [s.x + (i % s.cols) * s.dx, s.y + Math.floor(i / s.cols) * s.dy];
  const k = i - s.n, a = k * 2.399, r = 1.1 + 0.4 * Math.sqrt(k), [hx, hy] = SPOTS[z].home; // overflow: a small pile on open ground
  return [hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.7];
};

/** Truck door points and the two avenue lanes (northbound = towards Corporate Valley). */
export const DOORS = { 1: [26, 45.5], 2: [16, 28.6], 3: [16, 13.6] };
export const LANE = { north: 17.55, south: 18.45 };

const rectHas = ([x, y, w, d], px, py, m = 0) => px > x - m && px < x + w + m && py > y - m && py < y + d + m;

/** Static scenery. Deterministic: same island every time. Each prop: {t, gx, gy, w, d, h, z, key, ...params}. */
export function buildScenery() {
  const props = [];
  const add = (p) => { p.z = p.z ?? ELEV[zoneAt(p.gy)]; p.key = p.gx + (p.w || 0) / 2 + p.gy + (p.d || 0) / 2; props.push(p); return p; };
  const blocked = (gx, gy, r = 0.9) => {
    if (!inLand(gx, gy) || isRoad(gx, gy) || isRoad(gx + 0.5, gy + 0.5) || gy < 2 || gy > 47.2 || gx < 4 || gx > 31.5) return true;
    const z = zoneAt(gy);
    for (const k of Object.values(BUILD[z])) if (rectHas(k, gx, gy, r)) return true;
    for (const pl of PLOTS[z] || []) if (rectHas([pl[0], pl[1], 3, 3], gx, gy, r)) return true;
    const sp = SPOTS[z];
    for (const [x, y] of [...sp.leads, ...sp.lots]) if (Math.hypot(x - gx, y - gy) < r + 0.7) return true;
    const st = sp.stash; if (rectHas([st.x - 0.5, st.y - 0.5, st.cols * st.dx + 0.6, Math.ceil(st.n / st.cols) * st.dy + 0.6], gx, gy, r)) return true;
    if (Math.hypot(sp.home[0] - gx, sp.home[1] - gy) < r + 0.8) return true;
    return false;
  };
  const SOLID = new Set(['shack', 'depot', 'bank', 'office', 'shop', 'tower', 'ipo', 'fountain', 'helipad', 'junkcar', 'scrap', 'crates', 'tires', 'barrel']);
  const scatter = (z, seed, n, area, make, r = 0.9) => {
    let placed = 0;
    for (let i = 0; placed < n && i < n * 60; i++) {
      const gx = area[0] + h2(seed, i * 2) * (area[2] - area[0]), gy = area[1] + h2(seed, i * 2 + 1) * (area[3] - area[1]);
      const prop = { ...make(placed, h2(seed + 5, i)), gx, gy }, w = prop.w || 0.5, d = prop.d || 0.5;
      const corners = [[gx, gy], [gx + w, gy], [gx, gy + d], [gx + w, gy + d], [gx + w / 2, gy + d / 2]];
      if (corners.some(([x, y]) => blocked(x, y, r))) continue;
      if (props.some((o) => SOLID.has(o.t) && gx < o.gx + (o.w || 0) + 0.3 && gx + w > o.gx - 0.3 && gy < o.gy + (o.d || 0) + 0.3 && gy + d > o.gy - 0.3)) continue;
      add(prop); placed++;
    }
  };

  // ---- Zone 1: the Scrap Yard
  const B1 = BUILD[1];
  add({ t: 'shack', gx: B1.hq[0], gy: B1.hq[1], w: B1.hq[2], d: B1.hq[3], h: 38, hot: 'hq:1', label: 'Training shack' });
  add({ t: 'depot', gx: B1.depot[0], gy: B1.depot[1], w: B1.depot[2], d: B1.depot[3], h: 34, hot: 'depot:1', label: 'Freight depot', color: '#8a5a3a' });
  add({ t: 'board', gx: B1.board[0], gy: B1.board[1], w: B1.board[2], d: B1.board[3], h: 40, hot: 'board:1', label: 'Market board', text: 'ZONE 1' });
  add({ t: 'crane', gx: 31, gy: 36, w: 1, d: 1, h: 120, label: 'Scrap crane' });
  scatter(1, 11, 14, [4, 34, 32, 48], (i, r) => ({ t: 'scrap', w: 1.4, d: 1.4, h: 18 + r * 18, seed: i + 3 }), 1.4);
  scatter(1, 12, 7, [4, 34, 32, 48], (i) => ({ t: 'tires', w: 0.9, d: 0.9, h: 24, n: 3 + (i % 3) }), 1.0);
  scatter(1, 13, 9, [4, 34, 32, 48], (i, r) => ({ t: 'barrel', w: 0.7, d: 0.7, h: 22, color: ['#b0493a', '#3d6fb0', '#4a7f55', '#c28a2b'][i % 4], fire: i === 3 }), 0.8);
  scatter(1, 14, 8, [4, 34, 32, 48], (i, r) => ({ t: 'crates', w: 1.2, d: 1.2, h: 26, n: 1 + (i % 3) }), 1.1);
  scatter(1, 15, 4, [4, 34, 32, 48], (i, r) => ({ t: 'junkcar', w: 2.4, d: 1.3, h: 22, color: ['#8c4a2f', '#5b6573', '#6b7a45', '#7a4b6b'][i % 4] }), 1.6);
  scatter(1, 16, 5, [4, 34, 32, 48], () => ({ t: 'deadtree', w: 0.6, d: 0.6, h: 40 }), 1.0);
  for (let x = 4; x < 32; x += 3) add({ t: 'fence', gx: x, gy: 47.6, w: 3, d: 0.1, h: 20 });
  for (let y = 34; y < 47; y += 3) { add({ t: 'fence', gx: 3.6, gy: y, w: 0.1, d: 3, h: 20, dirY: true }); }
  for (const [x, y] of [[16.2, 38], [19.8, 38], [16.2, 45], [19.8, 45]]) add({ t: 'lamp', gx: x, gy: y, w: 0.2, d: 0.2, h: 32 });

  // ---- Zone 2: the Metro Hub
  const B2 = BUILD[2];
  add({ t: 'bank', gx: B2.bank[0], gy: B2.bank[1], w: B2.bank[2], d: B2.bank[3], h: 60, hot: 'bank', label: 'Commercial Bank' });
  add({ t: 'office', gx: B2.audit[0], gy: B2.audit[1], w: B2.audit[2], d: B2.audit[3], h: 46, hot: 'audit', label: 'Regulatory office', color: '#8b93a8', sign: 'AUDIT' });
  add({ t: 'office', gx: B2.hq[0], gy: B2.hq[1], w: B2.hq[2], d: B2.hq[3], h: 40, hot: 'hq:2', label: 'Training office', color: '#5a7fb0', sign: 'SKILLS' });
  add({ t: 'depot', gx: B2.depot[0], gy: B2.depot[1], w: B2.depot[2], d: B2.depot[3], h: 34, hot: 'depot:2', label: 'Freight depot', color: '#4f7a86' });
  add({ t: 'board', gx: B2.board[0], gy: B2.board[1], w: B2.board[2], d: B2.board[3], h: 40, hot: 'board:2', label: 'Market board', text: 'ZONE 2' });
  const shops = ['#c4663f', '#4a8f8a', '#b59a3f', '#7a5fb0', '#c45f7a', '#5a8f4f'];
  for (let i = 0; i < 5; i++) add({ t: 'shop', gx: 20.2 + i * 2.4, gy: 29.7, w: 2.1, d: 1.1, h: 30 + (i % 3) * 8, color: shops[i % shops.length], seed: i });
  for (const [x, y] of [[16.2, 20], [19.8, 20], [16.2, 28], [19.8, 28], [16.2, 24], [19.8, 24]]) add({ t: 'lamp', gx: x, gy: y, w: 0.2, d: 0.2, h: 32 });
  scatter(2, 21, 9, [4, 18, 32, 31], (i) => ({ t: 'tree', w: 0.5, d: 0.5, h: 40, s: 0.8 + (i % 3) * 0.15, seed: i }), 1.0);
  scatter(2, 22, 4, [4, 18, 32, 31], () => ({ t: 'bench', w: 1, d: 0.4, h: 8 }), 0.9);

  // ---- Zone 3: Corporate Valley
  const B3 = BUILD[3];
  add({ t: 'ipo', gx: B3.ipo[0], gy: B3.ipo[1], w: B3.ipo[2], d: B3.ipo[3], h: 190, hot: 'ipo', label: 'IPO and M&A tower' });
  add({ t: 'tower', gx: B3.hq[0], gy: B3.hq[1], w: B3.hq[2], d: B3.hq[3], h: 96, hot: 'hq:3', label: 'Training campus', color: '#5a6fb0', seed: 1 });
  add({ t: 'depot', gx: B3.depot[0], gy: B3.depot[1], w: B3.depot[2], d: B3.depot[3], h: 30, hot: 'depot:3', label: 'Freight depot', color: '#6a5fa0' });
  add({ t: 'board', gx: B3.board[0], gy: B3.board[1], w: B3.board[2], d: B3.board[3], h: 40, hot: 'board:3', label: 'Market board', text: 'ZONE 3' });
  add({ t: 'tower', gx: 29, gy: 8.6, w: 2.2, d: 1.6, h: 110, color: '#4a8fb0', seed: 2 });
  add({ t: 'tower', gx: 19.4, gy: 2.6, w: 2.2, d: 2.2, h: 84, color: '#7a6fc0', seed: 3 });
  add({ t: 'fountain', gx: 23.6, gy: 8.4, w: 2, d: 2, h: 8 });
  add({ t: 'helipad', gx: 26.4, gy: 8.4, w: 2, d: 2, h: 2, z: ELEV[3] });
  for (const [x, y] of [[16.2, 3], [19.6, 8.5], [16.2, 11], [19.8, 12], [16.2, 7.4], [32, 9]]) add({ t: 'lamp', gx: x, gy: y, w: 0.2, d: 0.2, h: 32 });
  scatter(3, 31, 8, [4, 2, 32, 15], (i) => ({ t: 'tree', w: 0.5, d: 0.5, h: 40, s: 0.9 + (i % 3) * 0.12, seed: i, c: '#2f8a62' }), 1.0);

  props.sort((a, b) => a.key - b.key);
  return props;
}

/** Ground decals (puddles, dashes, speckles), culled by tile at draw time. */
export function groundColor(gx, gy) {
  const z = zoneAt(gy), j = h2(gx, gy);
  if (!inLand(gx, gy)) return null;
  const rim = gx === LAND.x0 || gx === LAND.x1 - 1 || gy === LAND.y0 || gy === LAND.y1 - 1;
  if (rim) return z === 3 ? '#7a8aa0' : z === 2 ? '#8a8472' : '#8a7a58';
  if (isAvenue(gx, gy)) return j > 0.5 ? '#2f3644' : '#2c3340';
  if (isStreet(gx, gy)) return '#2f3644';
  if (z === 1) { const v = j; return v > 0.86 ? '#7a7566' : v > 0.7 ? '#6a5b43' : v > 0.35 ? '#705f45' : '#675840'; }
  if (z === 2) { if (isWalk(gx, gy)) return '#8590a4'; return (gx + gy) % 2 ? '#4d586c' : '#485367'; }
  if (isWalk(gx, gy)) return '#98a3bd';
  if (h2(gx >> 2, gy >> 2) > 0.8 && gx > 19) return '#2f6b4a';
  return (gx + gy) % 2 ? '#3d4c70' : '#384769';
}

export const SCENERY = buildScenery();
