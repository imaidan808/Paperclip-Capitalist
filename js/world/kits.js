// Theme kits: what each of the sixteen districts is made of. Pure data and placement rules, no drawing.
// What it holds: per theme the headquarters look, the colours of its lamps and trees, where its buildings and scenery go (place), its ground treatment (decals),
// and the sprawl that fills its pad (FILL). Options that only say how a prop is DRAWN (mat: 'brick' | 'glass' | 'metal' | 'plaster' | 'stone' | 'boards', see shading.js)
// may be added to any prop; they never change a footprint. What it never does: draw, use Math.random, or move a prop once placed.
// A kit's place(A) puts the theme's buildings and scenery into a district block through the generator's API (layout.js);
// decals(A) lays the ground treatment (lawns, cobbles, bays, circuits...). Everything is deterministic: same island every time.
//   A.add(type, lx, ly, w, d, h, opts)   a solid prop (refused, returns null, if it would overlap anything or stand on a road)
//   A.deco(type, lx, ly, w, d, h, opts)  a thin or tiny prop that is not solid (lamps, banners, planters, fences)
//   A.scatter(seed, n, area, make, margin) n solid props placed by seeded scatter into area [x, y, w, d]
//   A.decal({k, ...}), A.rest = free part of the north-east quarter [x, y, w, d] (after a feature landmark), A.NW = free yard or null
//   A.pal = [ground, accent]; A.cols = derived colours; A.SE = the strip behind the lots [x, y, w, d]; A.sx(x) mirrors an x when the plan is flipped
import { mix, shade } from './iso.js';

export const KITS = {};
const kit = (theme, def) => { KITS[theme] = def; };
const WALL = (A, y = 0.15, col = '#6b5a45', n = 7) => { for (let i = 0; i < n; i++) A.deco('fence', 1 + i * 3, y, 3, 0.1, 18, { col }); };

kit('scrap', {
  hq: { t: 'shack' }, depot: '#d9874f', lamp: '#ffe9a8', tree: '#5d6a3a', ground: (g) => mix(g, '#9a7a50', 0.5),
  place(A) {
    A.add('crane', 19.6, 1.6, 1, 1, 118, { ext: 90, label: 'Scrap crane' });
    A.add('scrap', 13.2, 1.0, 4.4, 3.4, 36, { seed: 1, label: 'Scrap heap' });
    A.scatter(11, 8, A.NW, (i, r) => ({ t: 'scrap', w: 1.4, d: 1.4, h: 18 + r * 18, seed: i + 3 }), 1.3);
    A.scatter(12, 4, A.NW, (i) => ({ t: 'tires', w: 0.9, d: 0.9, h: 24, n: 3 + (i % 3), sm: 1 }), 0.9);
    A.scatter(13, 5, A.NW, (i) => ({ t: 'barrel', w: 0.7, d: 0.7, h: 22, color: ['#b0493a', '#3d6fb0', '#4a7f55', '#c28a2b'][i % 4], fire: i === 3, sm: 1 }), 0.8);
    A.scatter(14, 4, A.NW, (i) => ({ t: 'crates', w: 1.2, d: 1.2, h: 26, n: 1 + (i % 3), sm: 1 }), 1.0);
    A.scatter(15, 2, A.NW, (i) => ({ t: 'junkcar', w: 2.4, d: 1.3, h: 22, color: ['#8c4a2f', '#5b6573', '#6b7a45', '#7a4b6b'][i % 4] }), 1.4);
    A.scatter(16, 3, A.NW, () => ({ t: 'deadtree', w: 0.6, d: 0.6, h: 40, sm: 1 }), 1.0);
    A.scatter(17, 3, A.SE, (i) => ({ t: i % 2 ? 'crates' : 'barrel', w: 0.8, d: 0.8, h: 22, n: 2, color: '#b0493a', sm: 1 }), 0.7);
    WALL(A);
  },
  decals(A) {
    const [g] = A.pal;
    for (let i = 0; i < 22; i++) A.decal({ k: 'ell', x: 1 + A.r(i) * 19, y: 1 + A.r(i + 40) * 15, r: 0.35 + A.r(i + 80) * 0.5, fill: i % 3 ? 'rgba(20,16,12,.3)' : 'rgba(110,150,190,.32)', min: 0.45 });
    A.decal({ k: 'spk', x: 0.5, y: 0.5, w: 21, d: 17, n: 90, seed: 3, fill: shade(g, 1.5), r: 1.4, min: 0.7 });
  },
});

kit('market', {
  hq: { col: '#ffe8a0', roof: 'gable', roofCol: '#e2704c', awn: true, sign: 'SKILLS' }, depot: '#f0a060', lamp: '#ffd36e', tree: '#6a8a3a',
  place(A) {
    const a = A.pal[1], awn = [a, '#e8503a', '#f2c94c', '#3aa7a0', '#c45f7a'];
    const R = A.rest;
    if (R) { const cols = Math.max(1, Math.floor(R[2] / 2.6)); for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) A.add('stall', R[0] + 0.1 + c * 2.6, R[1] + 0.2 + r * 2.4, 2.3, 1.6, 22, { col: '#8a5a32', awn: awn[(r * 3 + c) % awn.length], awn2: '#fff4dc', goods: (r + c) % 3 }); }
    if (A.NW) { for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) A.add('stall', 0.9 + c * 2.7, 0.8 + r * 2.7, 2.3, 1.6, 22, { col: '#8a5a32', awn: awn[(r + c * 2 + 1) % awn.length], awn2: '#fff4dc', goods: (r * 3 + c) % 3 }); A.scatter(21, 4, A.NW, (i) => ({ t: 'crates', w: 0.9, d: 0.9, h: 18, n: 1 + (i % 2), sm: 1 }), 0.7); }
    A.scatter(22, 3, A.SE, (i) => ({ t: 'cart', w: 1.4, d: 0.9, h: 24, awn: awn[i + 1], sm: 1 }), 0.8);
    for (const x of [1, 6, 14, 19]) A.deco('lantern', x, 0.5, 0.2, 0.2, 34, { col: a });
  },
  decals(A) {
    const a = A.pal[1];
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) A.decal({ k: 'checker', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1, c1: mix(A.cols.ground, '#ffb060', 0.12), c2: mix(A.cols.ground, '#2a1608', 0.12), min: 0.6 });
    A.decal({ k: 'stripes', x: 0, y: 7.2, w: 22, d: 0.5, n: 22, axis: 'x', c1: a, c2: mix(a, '#fff', 0.6), min: 0.5 });
  },
});

kit('campus', {
  hq: { col: '#e0795a', roof: 'gable', roofCol: '#7396d6', clock: true, sign: 'SKILLS', mat: 'brick' }, depot: '#d9785f', lamp: '#ffe9a8', tree: '#3f8f4a',
  place(A) {
    const R = A.rest;
    if (R) { A.add('bldg', R[0], R[1] + 0.2, Math.min(R[2], 7), 3.6, 44, { col: '#e0795a', trim: '#fff0d2', roof: 'gable', roofCol: '#7396d6', win: [6, 3], sign: 'LIBRARY', clock: true, mat: 'brick' }); }
    if (A.NW) {
      A.add('fountain', 2.6, 2.6, 2, 2, 8);
      A.add('bldg', 5.8, 0.8, 2.9, 2.2, 28, { col: '#f0907a', trim: '#fff0d2', roof: 'gable', roofCol: '#7396d6', win: [3, 2], sign: 'LAB', mat: 'brick' });
      A.scatter(31, 7, A.NW, (i) => ({ t: 'tree', w: 0.5, d: 0.5, h: 40, s: 0.85 + (i % 3) * 0.12, seed: i, c: '#3f8f4a', sm: 1 }), 0.9);
      A.scatter(32, 4, A.NW, () => ({ t: 'bench', w: 1, d: 0.4, h: 8, sm: 1 }), 0.8);
    }
    A.scatter(33, 4, A.SE, (i) => ({ t: i % 2 ? 'tree' : 'bench', w: i % 2 ? 0.5 : 1, d: i % 2 ? 0.5 : 0.4, h: 30, s: 0.9, seed: i, c: '#3f8f4a', sm: 1 }), 0.8);
    for (const x of [2, 7, 14, 19]) A.deco('flag', x, 0.6, 0.2, 0.2, 40, { col: A.pal[1] });
  },
  decals(A) {
    const lawn = mix('#2f7a3a', A.cols.ground, 0.15);
    for (const q of [[0.5, 0.5, 8.5, 6.5], [13, 0.5, 8.5, 6.5], [0.5, 11, 8.5, 6.5], [13, 11, 8.5, 6.5]]) { A.decal({ k: 'rect', x: q[0], y: q[1], w: q[2], d: q[3], fill: lawn }); A.decal({ k: 'stripes', x: q[0], y: q[1], w: q[2], d: q[3], n: 8, axis: 'y', c1: 'rgba(255,255,255,0.05)', c2: 'rgba(0,0,0,0.06)', min: 0.5 }); }
    A.decal({ k: 'rect', x: 8.2, y: 3, w: 1, d: 5, fill: mix(A.cols.walk, '#8a3a2a', 0.35) });
  },
});

kit('pawn', {
  hq: { col: '#34b0a8', roof: 'flat', roofCol: '#f2c14a', neon: '#f2a81a', sign: 'SKILLS' }, depot: '#4ec2b2', lamp: '#e0b84a', tree: '#2f6a5a',
  place(A) {
    const a = A.pal[1], R = A.rest, neons = ['#f2a81a', '#ff4fa3', '#22b8d8'];
    if (R) { const n = R[2] >= 6 ? 3 : 1; for (let i = 0; i < n; i++) A.add('bldg', R[0] + 0.1 + i * (R[2] / n), R[1] + 0.3, R[2] / n - 0.25, 3.4 - (i % 2) * 0.6, 28 + (i % 2) * 8, { col: ['#34b0a8', '#ffb7a0', '#ffe08a'][i % 3], roof: 'flat', roofCol: ['#f2c14a', '#34b0a8', '#ff9a7a'][i % 3], win: [2, 2], bars: 1, sign: ['PAWN', 'CASH', 'GOLD'][i], neon: neons[i % 3], door: 1 }); }
    if (A.NW) { for (let i = 0; i < 3; i++) A.add('bldg', 0.9 + i * 2.7, 0.7, 2.4, 2.8 - (i % 2) * 0.5, 26 + i * 4, { col: ['#ffb7a0', '#34b0a8', '#ffe08a'][i], roof: 'flat', roofCol: ['#34b0a8', '#f2c14a', '#ff9a7a'][i], win: [2, 2], bars: 1, sign: ['LOANS', 'GEMS', 'GOLD'][i], neon: neons[(i + 1) % 3], door: 1 }); A.scatter(41, 3, A.NW, () => ({ t: 'crates', w: 0.9, d: 0.9, h: 14, n: 2, sm: 1 }), 0.8); }
    A.add('neonpole', 20.4, 6.1, 0.3, 0.3, 54, { text: '000', col: a });
    A.scatter(42, 3, A.SE, (i) => ({ t: 'crates', w: 0.9, d: 0.9, h: 14, n: 1 + (i % 2), sm: 1 }), 0.7);
  },
  decals(A) {
    const a = A.pal[1];
    for (let i = 0; i < 14; i++) A.decal({ k: 'rect', x: 0.5 + A.r(i) * 20, y: 0.5 + A.r(i + 30) * 16, w: 0.35, d: 1.6 + A.r(i + 60) * 2.4, fill: ['rgba(224,184,74,.16)', 'rgba(255,79,163,.14)', 'rgba(95,224,255,.14)'][i % 3], min: 0.55 });
    A.decal({ k: 'ell', x: 4.5, y: 12.8, r: 1.1, fill: 'rgba(110,170,200,.28)', min: 0.5 }); A.decal({ k: 'ell', x: 16.5, y: 6.4, r: 0.9, fill: 'rgba(110,170,200,.26)', min: 0.5 });
    A.decal({ k: 'rect', x: 0, y: 7, w: 22, d: 0.12, fill: a, min: 0.5 }); A.decal({ k: 'rect', x: 0, y: 10.9, w: 22, d: 0.12, fill: a, min: 0.5 });
  },
});

kit('metro', {
  hq: { col: '#5f9fe0', roof: 'flat', roofCol: '#8fa8d0', win: [3, 4], sign: 'SKILLS', mat: 'glass' }, depot: '#6f9bd6', lamp: '#bfe0ff', tree: '#3f7a62',
  place(A) {
    const R = A.rest;
    if (R && R[2] >= 2.4) A.add('tower', R[0] + 0.1, R[1] + 0.8, Math.min(R[2] - 0.2, 2.3), 2.3, 96, { color: '#6fb4ea', seed: 2 });
    A.add('billboard', 17.2, 5.8, 3.4, 0.3, 40, { col: A.pal[1], text: 'METRO', ext: 10 });
    A.add('kiosk', 19.4, 12.8, 1.1, 1.1, 22, { col: '#5fa8e8', sign: 'M' });
    A.scatter(51, 4, A.SE, (i) => ({ t: i % 2 ? 'planter' : 'bench', w: i % 2 ? 0.8 : 1, d: i % 2 ? 0.8 : 0.4, h: 10, sm: 1 }), 0.8);
    for (const x of [3, 8, 14, 19]) A.deco('tree', x, 6.2, 0.4, 0.4, 36, { s: 0.7, c: '#3f7a62' });
  },
  decals(A) {
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) A.decal({ k: 'grid', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1, col: 'rgba(0,0,0,.14)', min: 0.7 });
    for (let k = 0; k < 6; k++) { A.decal({ k: 'rect', x: 10.1, y: 6.9 + k * 0.17, w: 1.8, d: 0.08, fill: 'rgba(255,255,255,.55)', min: 0.6 }); A.decal({ k: 'rect', x: 10.1, y: 10.0 + k * 0.17, w: 1.8, d: 0.08, fill: 'rgba(255,255,255,.55)', min: 0.6 }); }
  },
});

kit('estate', {
  hq: { col: '#fff0d4', roof: 'hip', roofCol: '#a272c8', win: [3, 2], sign: 'SKILLS' }, depot: '#a98bd6', lamp: '#f0e6c8', tree: '#3f6a4a',
  place(A) {
    const R = A.rest;
    if (R) A.add('manor', R[0], R[1] + 0.3, Math.min(R[2], 7.6), 4.0, 40, { col: '#fff0d4', roofCol: '#a272c8', acc: A.pal[1] });
    A.add('podium', 14.2, 12.9, 1.3, 1.0, 20, { col: '#a98bd6', acc: A.pal[1] });
    A.scatter(61, 5, A.SE, (i) => ({ t: 'topiary', w: 0.5, d: 0.5, h: 30, sm: 1 }), 0.7);
    if (A.NW) { A.add('manor', 0.9, 0.8, 5.2, 3.2, 34, { col: '#fff0d4', roofCol: '#a272c8', acc: A.pal[1] }); A.scatter(62, 6, A.NW, (i) => ({ t: i % 2 ? 'topiary' : 'tree', w: 0.5, d: 0.5, h: 34, s: 0.8, c: '#3f6a4a', sm: 1 }), 0.8); }
    for (let i = 0; i < 6; i++) A.deco('hedge', 1 + i * 3.2, 0.25, 2.6, 0.5, 10, { col: '#2f5a3a' });
    for (const x of [9.0, 12.4]) A.deco('pillar', x, 7.1, 0.5, 0.5, 34, { col: '#f0e6c8' });
  },
  decals(A) {
    const lawn = mix('#2f5a3a', A.cols.ground, 0.4);
    for (const q of [[0.5, 0.5, 8.5, 6.5], [13, 0.5, 8.5, 6.5], [0.5, 11, 8.5, 6.5], [13, 11, 8.5, 6.5]]) A.decal({ k: 'rect', x: q[0], y: q[1], w: q[2], d: q[3], fill: lawn });
    A.decal({ k: 'rect', x: 14.5, y: 5.6, w: 1.2, d: 1.3, fill: '#d8cba8', min: 0.5 }); A.decal({ k: 'rect', x: 4, y: 6.0, w: 1.2, d: 1.0, fill: '#d8cba8', min: 0.5 });
    A.decal({ k: 'stripes', x: 13, y: 12.4, w: 8, d: 1.4, n: 8, axis: 'x', c1: 'rgba(240,230,200,.12)', c2: 'rgba(0,0,0,0)', min: 0.6 });
  },
});

kit('auto', {
  hq: { col: '#f4f6fb', roof: 'flat', roofCol: '#e8eef8', win: [3, 1], doors: 2, sign: 'SKILLS', mat: 'metal' }, depot: '#cdd6ea', lamp: '#fff1c0', tree: '#4a6a4a',
  place(A) {
    const R = A.rest, red = A.pal[1];
    if (R) { A.add('bldg', R[0], R[1] + 0.4, Math.min(R[2], 6.6), 3.2, 28, { col: '#f4f6fb', trim: '#ffffff', roof: 'flat', roofCol: '#e8eef8', win: [6, 1], glass: 1, sign: 'AUTO', band: red, mat: 'metal' }); A.add('autos', R[0] + 0.2, R[1] + 3.8, Math.min(R[2] - 0.4, 6), 0.9, 12, { n: 4, seed: 3 }); }
    A.add('polesign', 20.2, 1.0, 0.4, 0.4, 70, { col: red, text: 'AUTO' });
    A.add('autos', 13.3, 12.8, 6.8, 1.0, 12, { n: 5, seed: 1 });
    if (A.NW) { A.add('bldg', 0.9, 0.8, 5.4, 3.0, 24, { col: '#d8e0f0', trim: '#ffffff', roof: 'flat', roofCol: '#e8eef8', win: [5, 1], doors: 3, sign: 'REPAIR', band: red, mat: 'metal' }); A.scatter(71, 4, A.NW, (i) => ({ t: 'tires', w: 0.9, d: 0.9, h: 24, n: 3 + (i % 3), sm: 1 }), 0.9); A.add('autos', 0.9, 4.6, 6.4, 1.0, 12, { n: 5, seed: 5 }); }
  },
  decals(A) {
    const w = 'rgba(255,255,255,.6)';
    for (let i = 0; i < 9; i++) { A.decal({ k: 'rect', x: 13.4 + i * 0.85, y: 12.55, w: 0.07, d: 1.5, fill: w, min: 0.6 }); }
    for (let i = 0; i < 8; i++) A.decal({ k: 'rect', x: 1.2 + i * 0.9, y: 11.3, w: 0.07, d: 1.0, fill: 'rgba(255,255,255,.4)', min: 0.8 });
    A.decal({ k: 'stripes', x: 0, y: 6.95, w: 22, d: 0.12, n: 44, axis: 'x', c1: A.pal[1], c2: '#e9e9e9', min: 0.5 }); A.decal({ k: 'stripes', x: 0, y: 10.93, w: 22, d: 0.12, n: 44, axis: 'x', c1: A.pal[1], c2: '#e9e9e9', min: 0.5 });
  },
});

kit('harbor', {
  hq: { col: '#d8e6f6', roof: 'saw', roofCol: '#3d6cb8', win: [3, 1], sign: 'SKILLS', mat: 'metal' }, depot: '#5f8fd6', lamp: '#ffe0b0', tree: '#4a6a6a',
  place(A) {
    const o = A.pal[1];
    A.add('gantry', 13.3, 4.7, 7.0, 0.9, 66, { col: o, ext: 40, label: 'Harbor crane' });
    A.add('ship', 14.4, 1.4, 5.6, 2.0, 16, { hull: '#3a3a44', acc: o });
    A.add('containers', 13.3, 12.7, 3.6, 1.2, 36, { nx: 3, ny: 1, stack: 2, seed: 2 });
    A.add('containers', 17.5, 12.7, 3.6, 1.2, 36, { nx: 3, ny: 1, stack: 3, seed: 5 });
    if (A.NW) { A.add('bldg', 0.9, 0.8, 5.0, 3.0, 30, { col: '#a8c8f0', trim: '#ffffff', roof: 'saw', roofCol: '#3d6cb8', win: [4, 1], sign: 'CUSTOMS', doors: 2, mat: 'metal' }); A.add('containers', 0.9, 4.2, 3.6, 1.2, 36, { nx: 3, ny: 1, stack: 2, seed: 7 }); A.add('containers', 4.6, 4.2, 3.6, 1.2, 36, { nx: 3, ny: 1, stack: 1, seed: 9 }); }
    for (let i = 0; i < 6; i++) A.deco('bollard', 13.4 + i * 1.2, 5.55, 0.3, 0.3, 8, { col: o });
  },
  decals(A) {
    A.decal({ k: 'water', x: 13.2, y: 0.8, w: 7.8, d: 4.0, fill: '#1f5f86', fill2: '#2a7aa4' });
    A.decal({ k: 'rect', x: 13.0, y: 4.8, w: 8.2, d: 1.2, fill: mix(A.cols.ground, '#9aa6b4', 0.35) });
    A.decal({ k: 'stripes', x: 13.0, y: 12.4, w: 8.2, d: 1.8, n: 14, axis: 'x', c1: 'rgba(255,138,61,.18)', c2: 'rgba(0,0,0,0)', min: 0.6 });
    A.decal({ k: 'rect', x: 0, y: 6.95, w: 22, d: 0.1, fill: A.pal[1], min: 0.5 });
  },
});

kit('industrial', {
  hq: { col: '#dfe6f4', roof: 'saw', roofCol: '#8aa0c0', win: [3, 1], sign: 'SKILLS', mat: 'metal' }, depot: '#8aa0c0', lamp: '#fff1b0', tree: '#58704a',
  place(A) {
    const R = A.rest, y = A.pal[1];
    if (R) A.add('factory', R[0], R[1] + 0.3, Math.min(R[2], 6), 4.0, 34, { col: '#b8c6de', acc: y, stacks: 2, seed: 1 });
    if (!R) A.add('factory', 13.4, 1.0, 7, 4.2, 34, { col: '#b8c6de', acc: y, stacks: 3, seed: 2 });
    A.add('tank', 13.5, 12.8, 1.6, 1.6, 42, { col: '#d6dff0', acc: y });
    A.add('tank', 15.4, 12.8, 1.6, 1.6, 42, { col: '#a8b0ba', acc: y });
    A.add('stack', 20.2, 13.0, 0.9, 0.9, 80, { col: '#6a7480', acc: y });
    if (A.NW) A.add('factory', 0.9, 0.8, 6.4, 4.2, 30, { col: '#b8c6de', acc: y, stacks: 2, seed: 3 });
  },
  decals(A) {
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) A.decal({ k: 'grid', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1.4, col: 'rgba(0,0,0,.18)', min: 0.7 });
    A.decal({ k: 'stripes', x: 0, y: 6.95, w: 22, d: 0.14, n: 44, axis: 'x', c1: A.pal[1], c2: '#1a1c20', min: 0.5 }); A.decal({ k: 'stripes', x: 0, y: 10.9, w: 22, d: 0.14, n: 44, axis: 'x', c1: A.pal[1], c2: '#1a1c20', min: 0.5 });
  },
});

kit('tech', {
  hq: { col: '#aab4f0', roof: 'flat', roofCol: '#8f98e0', win: [3, 2], neon: '#22d9ee', sign: 'SKILLS', mat: 'metal' }, depot: '#7f8ae0', lamp: '#35e0ff', tree: '#1f6a6a', glow: 1,
  place(A) {
    const R = A.rest, c = A.pal[1];
    if (R) { const n = Math.max(1, Math.floor(R[2] / 2.6)); for (let i = 0; i < n; i++) A.add('rack', R[0] + 0.1 + i * 2.6, R[1] + 0.4, 2.3, 3.2, 34 + (i % 2) * 8, { col: '#7b88d8', acc: c, seed: i }); }
    A.add('dome', 13.6, 12.9, 2.6, 2.6 - 1.2, 24, { acc: c });
    A.add('dish', 18.4, 12.8, 1.2, 1.2, 36, { acc: c, col: '#c9d6e4' });
    if (A.NW) { for (let i = 0; i < 3; i++) A.add('rack', 0.9 + i * 2.7, 0.8, 2.4, 3.4, 36 + i * 4, { col: '#7b88d8', acc: c, seed: i + 4 }); A.add('dish', 6.4, 5.0, 1.2, 1.2, 36, { acc: c, col: '#c9d6e4' }); }
    for (const x of [2, 7, 14, 19]) A.deco('neonlamp', x, 0.4, 0.2, 0.2, 38, { col: c });
  },
  decals(A) {
    const c = A.pal[1];
    for (const q of [[0.5, 0.5, 8.5, 6.5], [13, 0.5, 8.5, 6.5], [0.5, 11, 8.5, 6.5], [13, 11, 8.5, 6.5]]) { A.decal({ k: 'grid', x: q[0], y: q[1], w: q[2], d: q[3], step: 1, col: 'rgba(53,224,255,.16)', min: 0.55 }); A.decal({ k: 'pulse', x: q[0] + 2, y: q[1] + 2, w: q[2] - 4, d: q[3] - 4, col: c, min: 0.5 }); }
    A.decal({ k: 'rect', x: 0, y: 7.0, w: 22, d: 0.1, fill: c, min: 0.4 }); A.decal({ k: 'rect', x: 0, y: 10.9, w: 22, d: 0.1, fill: c, min: 0.4 });
  },
});

kit('farm', {
  hq: { col: '#e8604a', roof: 'gable', roofCol: '#b04a3a', trim: '#fff6e8', win: [2, 1], sign: 'SKILLS', mat: 'boards' }, depot: '#d9553f', lamp: '#ffe0a0', tree: '#3f8a3a',
  place(A) {
    const R = A.rest;
    if (R) { A.add('barn', R[0], R[1] + 0.3, Math.min(R[2], 5.4), 3.8, 36, { col: '#e8503a', trim: '#fff6e8' }); if (R[2] > 6) A.add('silo', R[0] + 5.8, R[1] + 0.5, 1.4, 1.4, 70, { col: '#c9ccd0' }); }
    A.add('windmill', 19.6, 13.0, 1.2, 1.2, 74, { col: '#e9e2d0' });
    A.scatter(81, 5, A.SE, (i) => ({ t: 'hay', w: 0.9, d: 0.9, h: 14, sm: 1 }), 0.7);
    if (A.NW) { A.add('barn', 0.9, 0.8, 4.6, 3.2, 32, { col: '#e8503a', trim: '#fff6e8' }); A.add('silo', 6.2, 0.9, 1.4, 1.4, 66, { col: '#c9ccd0' }); A.scatter(82, 4, A.NW, () => ({ t: 'hay', w: 0.9, d: 0.9, h: 14, sm: 1 }), 0.7); }
    for (let i = 0; i < 7; i++) A.deco('fence', 1 + i * 3, 0.2, 3, 0.1, 16, { col: '#e9e2d0' });
  },
  decals(A) {
    const g = A.cols.ground;
    const crops = (x, y, w, d, c1, c2) => A.decal({ k: 'stripes', x, y, w, d, n: Math.round(d / 0.55), axis: 'y', c1, c2, min: 0.3 });
    crops(13, 0.5, 8.5, 6.5, mix(g, '#e8c547', 0.25), mix(g, '#2f7a2a', 0.2)); crops(0.5, 11, 8.5, 6.5, mix(g, '#2f7a2a', 0.3), mix(g, '#8a6a2a', 0.2));
    if (A.NW) crops(0.5, 0.5, 8.5, 6.5, mix(g, '#2f7a2a', 0.3), mix(g, '#e8c547', 0.2));
    A.decal({ k: 'rect', x: 13, y: 12.4, w: 8.5, d: 5.1, fill: mix(g, '#7a5a30', 0.45), min: 0.3 });
  },
});

kit('creative', {
  hq: { col: '#c8a6f6', roof: 'flat', roofCol: '#e8b8f0', win: [3, 2], neon: '#ff4fa3', sign: 'SKILLS', mat: 'metal' }, depot: '#b57de0', lamp: '#ff9bf0', tree: '#8a4aa0',
  place(A) {
    const R = A.rest, v = A.pal[1];
    if (R) { A.add('bldg', R[0], R[1] + 0.3, Math.min(R[2], 6.4), 3.8, 40, { col: '#c8a6f6', trim: '#fff4de', roof: 'flat', roofCol: '#e8b8f0', win: [4, 2], sign: 'ON AIR', neon: '#ff4fa3', studio: 1, mat: 'metal', band: v }); }
    A.add('billboard', 14.2, 5.7, 3.8, 0.3, 46, { col: v, text: 'NEW', ext: 14, anim: 1 });
    A.add('spot', 20.2, 13.0, 0.6, 0.6, 40, { col: v });
    A.add('spot', 13.6, 13.0, 0.6, 0.6, 40, { col: '#ff4fa3' });
    A.add('gantry', 15.6, 13.1, 3.4, 0.9, 40, { col: v, ext: 20, label: 'Camera crane' });
    if (A.NW) { A.add('bldg', 0.9, 0.8, 5.0, 3.4, 36, { col: '#b890f0', trim: '#fff4de', roof: 'flat', roofCol: '#e8b8f0', win: [3, 2], sign: 'STUDIO', neon: '#9b6dff', mat: 'metal', band: v }); A.add('billboard', 1.4, 5.2, 3.8, 0.3, 40, { col: '#ff4fa3', text: 'LIVE', ext: 12, anim: 1 }); }
  },
  decals(A) {
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) A.decal({ k: 'checker', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1.25, c1: mix(A.cols.ground, '#ff4fa3', 0.14), c2: mix(A.cols.ground, '#9b6dff', 0.14), min: 0.55 });
    A.decal({ k: 'spk', x: 0.5, y: 0.5, w: 21, d: 17, n: 70, seed: 9, fill: '#ffe66d', r: 1.6, min: 0.8 });
  },
});

kit('corporate', {
  hq: { col: '#6fb4ea', roof: 'flat', roofCol: '#9fcbea', win: [4, 5], glass: 1, sign: 'SKILLS' }, depot: '#5fa0d8', lamp: '#bfe8ff', tree: '#3f8a7a',
  place(A) {
    const R = A.rest;
    if (R && R[2] >= 2.8) A.add('tower', R[0] + 0.1, R[1] + 0.9, Math.min(R[2] - 0.2, 2.7), 2.7, 118, { color: '#6fb4ea', seed: 4 });
    A.add('fountain', 14.0, 12.8, 1.7, 1.7, 8);
    for (let i = 0; i < 3; i++) A.deco('flag', 17.6 + i * 1.2, 13.3, 0.2, 0.2, 44, { col: A.pal[1] });
    if (A.NW) { A.add('tower', 1.0, 0.8, 2.8, 2.8, 100, { color: '#8aa6f0', seed: 5 }); A.add('tower', 4.6, 1.4, 2.6, 2.6, 80, { color: '#78c0e8', seed: 6 }); }
    A.scatter(91, 4, A.SE, () => ({ t: 'planter', w: 0.8, d: 0.8, h: 10, sm: 1 }), 0.8);
  },
  decals(A) {
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) { A.decal({ k: 'grid', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1.5, col: 'rgba(255,255,255,.1)', min: 0.7 }); A.decal({ k: 'stripes', x: q[0], y: q[1], w: 8.5, d: 6.5, n: 3, axis: 'x', c1: 'rgba(255,255,255,.07)', c2: 'rgba(0,0,0,0)', min: 0.5 }); }
  },
});

kit('finance', {
  hq: { col: '#eef6ea', roof: 'pediment', roofCol: '#4f9a78', win: [3, 1], col2: '#1f4d34', sign: 'SKILLS' }, depot: '#58b68a', lamp: '#f0f7e8', tree: '#2f6a4a',
  place(A) {
    const R = A.rest;
    if (R) A.add('hall', R[0], R[1] + 0.3, Math.min(R[2], 7), 4.1, 46, { col: '#eef6ea', acc: A.pal[1], roofCol: '#4f9a78', sign: 'BANK', globe: 0 });
    A.add('ticker', 17.0, 5.8, 4.0, 0.45, 26, { acc: '#6df0a0', text: 'AAPL 182.4 MSFT 411.2 BRK 389.7 GOLD 2041 ' });
    A.add('statue', 19.6, 12.8, 1.0, 1.0, 26, { col: '#c2a24a', bull: 1 });
    A.scatter(101, 4, A.SE, (i) => ({ t: i % 2 ? 'planter' : 'topiary', w: 0.6, d: 0.6, h: 26, sm: 1 }), 0.8);
    if (A.NW) { A.add('hall', 0.9, 0.8, 6.0, 3.6, 40, { col: '#eef6ea', acc: A.pal[1], roofCol: '#4f9a78', sign: 'TRUST' }); A.add('ticker', 1.0, 5.2, 4.6, 0.45, 26, { acc: '#6df0a0', text: 'BONDS 98.2 FX 1.09 OIL 78.4 ' }); }
  },
  decals(A) {
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) { A.decal({ k: 'checker', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1, c1: mix(A.cols.ground, '#ffffff', 0.05), c2: mix(A.cols.ground, '#000000', 0.12), min: 0.6 }); A.decal({ k: 'rect', x: q[0], y: q[1], w: 8.5, d: 0.08, fill: 'rgba(217,228,208,.5)', min: 0.55 }); }
  },
});

kit('realty', {
  hq: { col: '#fff0d4', roof: 'gable', roofCol: '#e2704c', win: [3, 2], sign: 'SKILLS', mat: 'plaster' }, depot: '#e8795a', lamp: '#ffe9c0', tree: '#4a8a4a',
  place(A) {
    const R = A.rest;
    A.add('forsale', 14.4, 12.9, 1.6, 0.4, 24, { col: A.pal[1] });
    A.scatter(111, 5, A.SE, (i) => ({ t: i % 2 ? 'tree' : 'planter', w: 0.6, d: 0.6, h: 34, s: 0.8, c: '#4a8a4a', sm: 1 }), 0.8);
    for (const x of [2, 6, 14, 18]) A.deco('tree', x, 6.3, 0.4, 0.4, 34, { s: 0.7, c: '#4a8a4a' });
    if (A.NW) { for (let i = 0; i < 3; i++) A.add('bldg', 0.9 + i * 2.7, 0.8, 2.4, 3.2, 30 + (i % 2) * 8, { col: ['#fff0d4', '#cdeedc', '#e1d4f3'][i], trim: '#ffffff', roof: 'gable', roofCol: ['#e2704c', '#3fb9b2', '#a272c8'][i], win: [2, 3], balc: 1, door: 1 }); }
    if (R) A.add('bldg', R[0], R[1] + 0.3, Math.min(R[2], 6), 3.6, 40, { col: '#fff0d4', trim: '#ffffff', roof: 'gable', roofCol: '#e2704c', win: [5, 3], balc: 1 });
  },
  decals(A) {
    const lawn = mix('#4a8a4a', A.cols.ground, 0.45);
    for (const q of [[0.5, 11, 8.5, 6.5], [13, 11, 8.5, 1.5]]) A.decal({ k: 'rect', x: q[0], y: q[1], w: q[2], d: q[3], fill: lawn });
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) A.decal({ k: 'checker', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 0.8, c1: 'rgba(255,255,255,.05)', c2: 'rgba(0,0,0,.07)', min: 0.8 });
  },
});

kit('exchange', {
  hq: { col: '#fffaf0', roof: 'pediment', roofCol: '#7a5a30', win: [3, 1], col2: '#2a2410', sign: 'SKILLS' }, depot: '#d8b24a', lamp: '#f5d36a', tree: '#6a6a3a', glow: 1,
  place(A) {
    const g = A.pal[1];
    A.add('ticker', 17.0, 5.8, 4.0, 0.45, 26, { acc: g, text: 'LDN +1.2  NYC -0.4  TYO +0.8  HKG +2.1  FRA -0.3 ' });
    A.scatter(121, 3, A.SE, () => ({ t: 'planter', w: 0.7, d: 0.7, h: 12, sm: 1 }), 0.6);
    for (let i = 0; i < 4; i++) A.deco('flag', 18.4 + i * 0.9, 13.3, 0.2, 0.2, 46, { col: g });
    if (A.NW) A.add('hall', 0.9, 0.8, 6.0, 3.6, 40, { col: '#fffaf0', acc: g, roofCol: '#7a5a30', sign: 'FX' });
  },
  decals(A) {
    const g = A.pal[1];
    A.decal({ k: 'ell', x: 11, y: 9, r: 1.9, fill: 'rgba(245,211,106,.18)', stroke: g, min: 0.45 }); A.decal({ k: 'ell', x: 11, y: 9, r: 1.2, fill: 'rgba(245,211,106,.14)', stroke: g, min: 0.45 });
    for (const q of [[0.5, 0.5], [13, 0.5], [0.5, 11], [13, 11]]) { A.decal({ k: 'grid', x: q[0], y: q[1], w: 8.5, d: 6.5, step: 1.5, col: 'rgba(245,211,106,.14)', min: 0.7 }); A.decal({ k: 'rect', x: q[0], y: q[1] + 6.4, w: 8.5, d: 0.1, fill: g, min: 0.5 }); }
  },
});

// ---- the sprawl round each district's core: what fills its pad (one prop maker per theme; layout.js scatters them off the roads) and a ground treatment for it
export const FILL = {
  scrap: (i, r) => (i % 3 ? { t: 'scrap', w: 1.4, d: 1.4, h: 16 + r * 16, seed: i + 40 } : { t: 'tires', w: 0.9, d: 0.9, h: 24, n: 3, sm: 1 }),
  market: (i) => (i % 2 ? { t: 'crates', w: 0.9, d: 0.9, h: 18, n: 1 + (i % 2), sm: 1 } : { t: 'cart', w: 1.4, d: 0.9, h: 24, awn: ['#e8503a', '#f2c94c', '#3aa7a0'][i % 3], sm: 1 }),
  campus: (i, r) => (i % 3 ? { t: 'tree', w: 0.5, d: 0.5, h: 40, s: 0.85 + r * 0.3, seed: i, c: '#3f8f4a', sm: 1 } : { t: 'bench', w: 1, d: 0.4, h: 8, sm: 1 }),
  pawn: () => ({ t: 'crates', w: 0.9, d: 0.9, h: 14, n: 2, sm: 1 }),
  metro: (i) => (i % 2 ? { t: 'tree', w: 0.5, d: 0.5, h: 36, s: 0.8, seed: i, c: '#3f7a62', sm: 1 } : { t: 'planter', w: 0.8, d: 0.8, h: 10, sm: 1 }),
  estate: (i) => ({ t: i % 2 ? 'topiary' : 'tree', w: 0.5, d: 0.5, h: 34, s: 0.8, c: '#3f6a4a', sm: 1 }),
  auto: (i) => (i % 3 ? { t: 'tires', w: 0.9, d: 0.9, h: 24, n: 3 + (i % 3), sm: 1 } : { t: 'autos', w: 3.6, d: 0.9, h: 12, n: 3, seed: i, sm: 1 }),
  harbor: (i) => ({ t: 'containers', w: 3.6, d: 1.2, h: 36, nx: 3, ny: 1, stack: 1 + (i % 3), seed: i }),
  industrial: (i, r) => (i % 3 === 0 ? { t: 'tank', w: 1.6, d: 1.6, h: 36 + r * 10, col: '#a8b0ba', acc: '#f2c230' } : i % 3 === 1 ? { t: 'stack', w: 0.9, d: 0.9, h: 70, col: '#6a7480', acc: '#f2c230' } : { t: 'crates', w: 1.2, d: 1.2, h: 26, n: 2, sm: 1 }),
  tech: (i, r) => (i % 3 ? { t: 'rack', w: 2.3, d: 3, h: 30 + r * 10, col: '#7b88d8', acc: '#35e0ff', seed: i } : { t: 'dish', w: 1.2, d: 1.2, h: 36, acc: '#35e0ff', col: '#c9d6e4' }),
  farm: (i) => (i % 3 === 0 ? { t: 'hay', w: 0.9, d: 0.9, h: 14, sm: 1 } : i % 3 === 1 ? { t: 'tree', w: 0.5, d: 0.5, h: 40, s: 1, seed: i, c: '#3f8a3a', sm: 1 } : { t: 'silo', w: 1.4, d: 1.4, h: 60, col: '#c9ccd0' }),
  creative: (i) => (i % 2 ? { t: 'spot', w: 0.6, d: 0.6, h: 40, col: '#9b6dff' } : { t: 'billboard', w: 3.4, d: 0.3, h: 40, col: '#ff4fa3', text: 'LIVE', ext: 12, anim: 1 }),
  corporate: (i, r) => (i % 2 ? { t: 'planter', w: 0.8, d: 0.8, h: 10, sm: 1 } : { t: 'tower', w: 2.4, d: 2.4, h: 70 + r * 40, color: ['#6fb4ea', '#8aa6f0', '#78c0e8'][i % 3], seed: i }),
  finance: (i) => (i % 2 ? { t: 'planter', w: 0.6, d: 0.6, h: 26, sm: 1 } : { t: 'topiary', w: 0.5, d: 0.5, h: 30, sm: 1 }),
  realty: (i, r) => (i % 2 ? { t: 'tree', w: 0.5, d: 0.5, h: 34, s: 0.8, c: '#4a8a4a', seed: i, sm: 1 } : { t: 'bldg', w: 2.4, d: 2.6, h: 26 + r * 8, col: ['#fff0d4', '#cdeedc', '#e1d4f3'][i % 3], trim: '#ffffff', roof: 'gable', roofCol: ['#e2704c', '#3fb9b2', '#a272c8'][i % 3], win: [2, 2], balc: 1, door: 1 }),
  exchange: () => ({ t: 'planter', w: 0.7, d: 0.7, h: 12, sm: 1 }),
};
const crops = (c1, c2) => (q) => [{ k: 'stripes', x: q[0], y: q[1], w: q[2], d: q[3], n: Math.max(2, Math.round(q[3] / 0.7)), axis: 'x', c1, c2, min: 0.3 }];
KITS.farm.padDecal = (q, qi) => crops(qi % 2 ? 'rgba(232,197,71,.35)' : 'rgba(47,122,42,.4)', 'rgba(0,0,0,0)')(q);
KITS.industrial.padDecal = (q) => [{ k: 'grid', x: q[0], y: q[1], w: q[2], d: q[3], step: 1.6, col: 'rgba(0,0,0,.22)', min: 0.7 }];
KITS.harbor.padDecal = (q) => [{ k: 'stripes', x: q[0], y: q[1], w: q[2], d: q[3], n: Math.max(2, Math.round(q[2] / 1.4)), axis: 'y', c1: 'rgba(255,138,61,.16)', c2: 'rgba(0,0,0,0)', min: 0.5 }];
KITS.campus.padDecal = (q) => [{ k: 'rect', x: q[0], y: q[1], w: q[2], d: q[3], fill: 'rgba(47,122,58,.35)', min: 0.3 }];
KITS.tech.padDecal = (q) => [{ k: 'grid', x: q[0], y: q[1], w: q[2], d: q[3], step: 1.5, col: 'rgba(53,224,255,.14)', min: 0.6 }];
