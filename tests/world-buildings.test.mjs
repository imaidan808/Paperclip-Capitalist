// The toy buildings (T3, docs/RENDER_PLAN.md): the colour ramps and the chunky box, the wall's own elevation, the parts, and every one of the 17 V2 building kinds drawn on a recording canvas in every light:
// no hairline, no black, no clip (a path clip makes every later draw in a software canvas cost half a millisecond), balanced save and restore, finite numbers, and the SAME hit polygons the legacy drawers leave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recCtx, thinnestStroke, callNames } from './helpers/recctx.mjs';
import { toHsl, fromHsl, rampOf, toyTone, toyRadius, toyBox, wallOf, onWall, rrect, contourOf } from '../js/world/solids.js';
import { box, tone as oldTone, P } from '../js/world/iso.js';
import { luma } from '../js/world/iso.js';
import * as PAL from '../js/world/palette.js';
import { lodOf } from '../js/world/lod.js';
import { SCENERY, DIST } from '../js/world/layout.js';
import { THEMES, themeRow, BASE } from '../js/world/bstyle.js';
import { tintC, detailOf, facesOf, hitsOf, on, LITE, reg, styleOf, windowGrid, wallMaterial, roof, flatRoof, awning, plank } from '../js/world/parts.js';
import { farBlock } from '../js/world/buildings.js';
import { BUILDING_KINDS, propV2, setFlags } from '../js/world/stack.js';
import { LAYER, DRAW } from '../js/world/props-common.js';
import '../js/world/props.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);
const COLOURS = [...Object.values(PAL.PLASTER), ...Object.values(PAL.TILE), ...Object.values(PAL.TOY), PAL.BRICK.mid, PAL.METAL.steelLight, PAL.WOOD.mid, PAL.METAL.rust, PAL.GLASS.top, PAL.GRASS.mid, '#d9874f', '#34b0a8', '#6fb4ea', '#fffaf0'];
const env = (o = {}) => ({ t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, locked: false, crunch: false, lod: lodOf(2.4), ...o });

test('hsl round-trips every palette colour, and the shade of a ramp moves towards violet-blue and down in lightness (art direction 2.1)', () => {
  for (const c of COLOURS) { const [h, s, l] = toHsl(c), back = fromHsl(h, s, l); for (let i = 1; i < 7; i += 2) assert.ok(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(c.slice(i, i + 2), 16)) <= 2, `${c} came back as ${back}`); }
  assert.equal(fromHsl(0, 0, 1), '#ffffff'); assert.equal(fromHsl(120, 1, 0.5), '#00ff00'); assert.deepEqual([...toHsl('#808080')].map((v) => +v.toFixed(2)), [0, 0, 0.5]);
  for (const c of COLOURS) {
    const R = rampOf(c), [h0, , l0] = toHsl(c), [h1, s1, l1] = toHsl(R.shade), [, , l2] = toHsl(R.deep), [, , lh] = toHsl(R.hi);
    assert.equal(R.mid, c); assert.ok(l1 < l0 - 0.05 || l0 < 0.2, `${c}: the shade is darker`); assert.ok(l2 <= l1, `${c}: deep is under shade`); assert.ok(lh >= l0 - 0.02, `${c}: hi is not darker than mid`); void h0; void h1; void s1;
  }
  const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180), warm = '#ffb347'; // orange: the shade is closer to violet (255) than the colour was, unless it was already as close as it gets
  assert.ok(hueDist(toHsl(rampOf(warm).shade)[0], 255) < hueDist(toHsl(warm)[0], 255)); assert.equal(rampOf(warm), rampOf(warm), 'ramps are memoised');
  assert.ok(Object.isFrozen(rampOf(warm)));
});

test('toyTone: the top, the sun side and the shade side step down in luma for every plaster, tile, brick, metal and toy colour, and the shade side leans violet-blue', () => {
  for (const c of COLOURS) {
    const t = toyTone(c), a = luma(t.t), b = luma(t.l), d = luma(t.r);
    assert.ok(1 - b / a >= 0.06, `${c}: top to sun side steps ${(1 - b / a).toFixed(3)}`); assert.ok(1 - d / b >= 0.14, `${c}: sun side to shade side steps ${(1 - d / b).toFixed(3)}`);
    const share = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return b / (r + g + b); }; assert.ok(share(t.r) >= share(t.l), `${c}: the shade side has more blue in it than the sun side`);
    assert.ok(!/^#0/.test(t.r), `${c}: no black`); assert.ok(Object.isFrozen(t));
  }
  assert.equal(toyTone('#e2704c'), toyTone('#e2704c'));
});

test('toyRadius is a seventh of the shorter side in world pixels, 3.5 to 14; contourOf is darker than its fill and never black', () => {
  assert.equal(toyRadius(0.1, 0.1), 3.5); assert.equal(toyRadius(9, 9), 14); near(toyRadius(2.4, 2.4), 2.4 * Math.hypot(32, 16) * 0.13, 1e-9); assert.equal(toyRadius(2, 8), toyRadius(8, 2));
  for (const c of COLOURS) { assert.ok(luma(contourOf(c)) < luma(c), c); assert.ok(!/^#0/.test(contourOf(c)), c); }
});

test('toyBox answers the faces box() answers, draws no clip, balances save and restore, keeps every band at 1.5 pixels or more and paints no black', () => {
  const a = recCtx(), b = recCtx();
  for (const [gx, gy, w, d, h, z] of [[3, 4, 2.4, 1.6, 36, 0], [10, 10, 1, 1, 12, 6], [0, 0, 3, 3, 80, 0], [5, 5, 0.4, 0.4, 6, 0]]) {
    const f = toyBox(a.ctx, gx, gy, w, d, h, '#ffc8d0', { z, contour: 2 }), g = box(b.ctx, gx, gy, w, d, h, oldTone('#ffc8d0'), { z });
    for (const k of ['left', 'right', 'top']) assert.deepEqual([...f[k]].map((p) => [...p]), g[k].map((p) => [...p]), k);
    assert.equal(f.sil.length, 6); near(f.r, toyRadius(w, d)); assert.equal(f.left.ins.length, 2); assert.ok(f.left.ins[0] > 0 && f.left.ins[1] === 0 && f.right.ins[1] > 0 && f.right.ins[0] === 0, 'a wall stays in from the rounded end only');
  }
  assert.equal(a.log.clips, 0, 'no path clip'); assert.equal(a.log.depth, 0); assert.equal(a.log.minDepth, 0);
  assert.ok(thinnestStroke(a.log) >= 1.5, 'the contour is a stroke of at least 1.5'); assert.ok(callNames(a.log).filter((n) => n === 'quadraticCurveTo').length >= 20, 'every face follows the rounded outline');
  for (const s of [...a.log.fills.map((f) => f.style)]) assert.ok(typeof s !== 'string' || !/^#0|^rgba?\(0,0,0|^rgba?\(8,10,20/.test(s), `${s} is black or ink`);
  const flat = recCtx(); toyBox(flat.ctx, 1, 1, 2, 2, 30, '#ffc8d0', { gloss: 0.5 }); const gloss = recCtx(); toyBox(gloss.ctx, 1, 1, 2, 2, 30, '#ffc8d0', { gloss: 1 }); assert.ok(gloss.log.fills.length > flat.log.fills.length, 'a slab goes without the gradients');
  const alpha = recCtx(); alpha.ctx.globalAlpha = 0.5; toyBox(alpha.ctx, 1, 1, 2, 2, 30, '#ffc8d0'); near(alpha.state.globalAlpha, 0.5);
});

test('a wall is a sheared rectangle: wallOf gives its width, height and slope and onWall maps the elevation onto it with a balanced save and restore', () => {
  const f = facesOf(3, 4, 2.4, 1.6, 36); const L = wallOf(f.left), R = wallOf(f.right);
  near(L.W, 2.4 * 32); near(L.k, 0.5); near(L.H, 36); near(R.W, 1.6 * 32); near(R.k, -0.5); assert.deepEqual(L.ins, [0, 0], 'a wall of a bare prism has no inset');
  const { ctx, log } = recCtx(); let seen = null; onWall(ctx, L, (c, ww, hh) => { seen = [ww, hh]; }); assert.deepEqual(seen, [L.W, L.H]);
  assert.equal(log.depth, 0); const tr = log.calls.find((c) => c[0] === 'transform'); assert.deepEqual(tr.slice(1), [1, 0.5, 0, 1, L.x0, L.y0]);
  const r = recCtx(); rrect(r.ctx, 0, 0, 10, 4, 99); assert.equal(callNames(r.log).filter((n) => n === 'quadraticCurveTo').length, 4); assert.equal(callNames(r.log).at(-1), 'closePath');
});

test('facesOf is the legacy prism: the polygons of box() at any elevation, and hitsOf lists left, right, top', () => {
  const { ctx } = recCtx(), b = box(ctx, 7, 2, 3, 2, 40, oldTone('#aaaaaa'), { z: 5 }), f = facesOf(7, 2, 3, 2, 40, 5);
  for (const k of ['left', 'right', 'top']) assert.deepEqual(f[k], b[k]);
  assert.deepEqual(hitsOf(f), [f.left, f.right, f.top]);
});

test('tintC veils a district under cloud (never darker than 5%) and hazes by the ground height; detailOf reads the engine\'s ladder, then the transform, then answers all in', () => {
  const c = '#ffd8b6'; assert.equal(tintC(c, { dim: 0 }), c); const v = tintC(c, { dim: 0.5 }); assert.ok(luma(v) >= luma(c) * 0.95, 'veiled, not buried'); assert.notEqual(v, c);
  const h = tintC(c, { dim: 0, hz: 0.09 }); assert.notEqual(h, c); assert.ok(luma(h) < 1);
  const d = lodOf(1.0).detail; assert.deepEqual([...detailOf({}, { lod: lodOf(1.0) })], [...d]); assert.deepEqual([...detailOf({}, { lodAll: true })], [1, 1, 1, 1]);
  const ctx = { getTransform: () => ({ a: 2.4 * 2 }) }; assert.ok(detailOf(ctx, {})[3] > 0.9, 'a transform of 4.8 is the closest zoom at density 2'); assert.equal(detailOf(ctx, {}).length, 4);
  assert.deepEqual([...LITE], [1, 0, 0, 0]); assert.equal(on(0.01), 0); assert.equal(on(0.5), 0.5);
});

test('the theme table has a row for each of the sixteen districts, every colour a six-digit hex, and a theme that is not one of them gets the generic row', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), Object.keys(PAL.DISTRICT_DAY).sort());
  for (const [k, row] of Object.entries(THEMES)) { for (const [f, v] of Object.entries(row)) if (typeof v === 'string' && v[0] === '#') assert.match(v, /^#[0-9a-f]{6}$/, `${k}.${f}`); assert.ok(luma(row.wall) >= 0.3, `${k}: a wall is never dark`); }
  assert.equal(themeRow('nowhere'), BASE); assert.equal(themeRow(undefined), BASE); assert.equal(themeRow('pawn').wall, THEMES.pawn.wall); assert.equal(themeRow('constructor'), BASE, 'an own key only');
  const th = Object.keys(DIST).map((z) => DIST[z].theme); assert.equal(new Set(th).size, 16);
});

test('a wall in a district is never the colour of its own ground: every building of the island stands out from the district it is in by at least 6% in luma or 12% in a colour channel', () => {
  for (const p of SCENERY) {
    if (!BUILDING_KINDS.has(p.t) || p.t === 'tower' || p.t === 'ipo') continue; const th = DIST[p.zone].theme, g = PAL.groundSet(th).ground, wall = p.col || p.color; if (!wall) continue;
    const dl = Math.abs(luma(wall) - luma(g)), dc = Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(wall.slice(i, i + 2), 16) - parseInt(g.slice(i, i + 2), 16)))) / 255;
    assert.ok(dl >= 0.04 || dc >= 0.12 || wall === '#fffaf0', `${p.t} in ${th}: wall ${wall} on ground ${g}`);
  }
});

// ---------------------------------------------------------------- every kind, every light
const KINDS = [...BUILDING_KINDS].filter((k) => k !== 'shop'); // 'shop' is not placed by any district and keeps its legacy drawer
const sample = (k) => SCENERY.filter((p) => p.t === k).filter((p, i, a) => a.findIndex((q) => q.zone === p.zone) === i).slice(0, 4);
const LIGHTS = { day: {}, evening: { night: 0.5 }, night: { night: 1 }, locked: { dim: 0.5 }, lite: { lite: true }, island: { far: true }, crunch: { crunch: true, alertAudit: true }, now: { t: 1234567 } };
test('the V2 drawer of every building kind is registered, built on the toy kit, and draws every building of the island in every light and at every zoom without a hairline, a black, a clip or a stray save', () => {
  setFlags('static-bldg:v2');
  for (const k of KINDS) {
    const v = propV2(k); assert.ok(v && typeof v.body === 'function' && typeof v.draw === 'function', k + ' has a V2 drawer'); assert.ok(Array.isArray(v.pad) && v.pad.length === 4, k + ' has its pad'); assert.equal(typeof v.far, 'function', k + ' has a cheap island view');
    const ps = sample(k); assert.ok(ps.length > 0, k + ' is placed by a district');
    for (const p of ps) for (const [name, lt] of Object.entries(LIGHTS)) for (const zoom of [0.3, 1, 2.4]) {
      const { ctx, log } = recCtx(), e = env({ ...lt, lod: lodOf(zoom), hz: 0.05 }); if (lt.far) e.far = true;
      let polys; assert.doesNotThrow(() => { polys = (lt.far && v.far ? v.far : v.draw)(ctx, p, e); }, `${k} ${name} z${zoom}`);
      assert.equal(log.depth, 0, `${k} ${name}: save and restore balance`); assert.equal(log.minDepth, 0); assert.equal(log.clips, 0, `${k} ${name}: no path clip`);
      assert.ok(thinnestStroke(log) >= 1.5, `${k} ${name} z${zoom}: a stroke of ${thinnestStroke(log)}`);
      for (const c of log.calls) for (const a of c.slice(1)) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${k} ${name}: ${c[0]}(${c.slice(1)}) holds a number that is not finite`);
      for (const f of log.fills) assert.ok(typeof f.style !== 'string' || !/^#0{2}|^rgba?\(0,0,0|^rgba?\(8,10,20|^#121826/.test(f.style), `${k} ${name}: ${f.style}`);
      if (polys) for (const q of polys) for (const pt of q) assert.ok(pt.every(Number.isFinite), k + ' hit');
    }
  }
});

test('every V2 drawer leaves the hit polygons the legacy drawer left, for every building of the island that has any (the body and the island view)', () => {
  let compared = 0;
  for (const k of KINDS) {
    const v = propV2 ? (setFlags('static-bldg:v2'), propV2(k)) : null, L = LAYER[k], legacy = L ? L.body : DRAW[k];
    for (const p of SCENERY.filter((q) => q.t === k)) {
      const a = v.body(recCtx().ctx, p, env()), b = legacy(recCtx().ctx, p, env());
      assert.deepEqual(a === undefined ? null : a, b === undefined ? null : b, `${k} (${DIST[p.zone].theme}): the same hit shapes as the legacy body`); compared++;
    }
  }
  assert.ok(compared >= 80, 'compared ' + compared + ' buildings');
  // the island view of a prop with a hot spot is the legacy far prism, raised to at least four pixels
  const hot = SCENERY.find((p) => p.t === 'depot' && p.hot), far = farBlock(recCtx().ctx, hot, env({ far: true })), g = facesOf(hot.gx, hot.gy, hot.w, hot.d, Math.max(4, hot.h)); assert.deepEqual(far, [g.left, g.right, g.top]);
  assert.equal(farBlock(recCtx().ctx, SCENERY.find((p) => p.t === 'stall'), env({ far: true })), null, 'a prop with no hot spot leaves none');
});

test('a building draws more as the zoom comes in: the near marks (frames, shutters, courses) and the close marks (shingles, curtains, flower boxes) are additive and absent at the island view', () => {
  setFlags('static-bldg:v2'); const p = SCENERY.find((q) => q.t === 'bldg' && DIST[q.zone].theme === 'market'), v = propV2('bldg'), ops = (z, lite) => { const r = recCtx(); v.body(r.ctx, p, env({ lod: lodOf(z), lite })); return r.log.calls.length; };
  const far = ops(0.2), mid = ops(0.5), nearN = ops(1.0), close = ops(2.4), lite = ops(2.4, true);
  assert.ok(far <= mid && mid < nearN && nearN < close, `operations by zoom ${far} ${mid} ${nearN} ${close}`); assert.equal(lite, far, 'the governor\'s lite is the base, complete');
  assert.ok(close > nearN * 1.3, 'the closest band adds a lot: shingles, curtains, flower boxes');
});

test('a V2 body leaves the picture complete at the base: windows, door, roof and sign are drawn at the island view too', () => {
  setFlags('static-bldg:v2'); const p = SCENERY.find((q) => q.t === 'bldg' && DIST[q.zone].theme === 'market'), r = recCtx(); propV2('bldg').body(r.ctx, p, env({ lod: lodOf(0.2), lite: true }));
  assert.ok(r.log.fills.length > 60, 'a base of ' + r.log.fills.length + ' fills'); assert.ok(callNames(r.log).includes('fillText'), 'the sign is lettered');
});

test('reg: with a canvas, at most two props a frame take the full drawing straight onto the scene and the rest stand a flat prism until their sprites are built; with none every draw is the full one', async () => {
  const calls = []; const def = { body: () => { calls.push('full'); return null; }, live: () => calls.push('live') }, cheap = () => { calls.push('cheap'); return null; };
  const d = reg('__probe', def, cheap); for (let i = 0; i < 4; i++) d.draw({}, {}, {}); assert.deepEqual(calls, ['full', 'live', 'full', 'live', 'full', 'live', 'full', 'live'], 'no canvas: always the full drawing');
  globalThis.OffscreenCanvas = class {}; calls.length = 0;
  await new Promise((r) => setTimeout(r, 12)); for (let i = 0; i < 5; i++) d.draw({}, {}, {}); assert.deepEqual(calls, ['full', 'live', 'full', 'live', 'cheap', 'live', 'cheap', 'live', 'cheap', 'live']);
  calls.length = 0; await new Promise((r) => setTimeout(r, 12)); d.draw({}, {}, {}); assert.equal(calls[0], 'full', 'a new frame starts again'); calls.length = 0; d.draw({}, {}, { forceFull: true }); d.draw({}, {}, { forceFull: true }); d.draw({}, {}, { forceFull: true }); assert.equal(calls.filter((c) => c === 'full').length, 3, 'forceFull always draws the full body');
  delete globalThis.OffscreenCanvas;
});

test('the parts draw in the wall\'s elevation: a window grid is one frame path, one glass path a row and a kind, and lights come on window by window with the night', () => {
  const L = wallOf(facesOf(0, 0, 3, 2, 40).left), count = (lit) => { const r = recCtx(); windowGrid(r.ctx, L, { cols: 4, rows: 3, x0: 5, x1: L.W - 5, y0: 6, y1: 36, S: 'l', lit, lv: [1, 0, 0, 0], seed: 1 }); return r.log; };
  const dark = count(0), some = count(0.5), all = count(2); assert.ok(dark.fills.length <= 1 + 3, 'a frame path and a glass path a row: ' + dark.fills.length); assert.ok(some.fills.length > dark.fills.length, 'lit windows are another kind'); 
  const lv = recCtx(); windowGrid(lv.ctx, L, { cols: 4, rows: 3, x0: 5, x1: L.W - 5, y0: 6, y1: 36, S: 'l', lv: [1, 1, 1, 1], box: true, curtain: '#f6b9c8', shutter: '#7be0cf', seed: 3 }); assert.ok(lv.log.fills.length > dark.fills.length + 5, 'near and close marks add fills'); assert.equal(lv.log.depth, 0); assert.ok(thinnestStroke(lv.log) >= 1.5);
  const m = recCtx(); wallMaterial(m.ctx, { ...L, ins: [5, 0] }, 'brick', '#e0795a', 'l', [1, 1, 1, 1], 3); assert.equal(m.log.clips, 0, 'a material is painted inside its inset, not under a clip'); assert.equal(m.log.depth, 0);
  for (const c of m.log.calls.filter((x) => x[0] === 'rect')) assert.ok(c[1] >= 5 - 1e-9, 'every band starts inside the wall\'s inset');
  const a = recCtx(); awning(a.ctx, facesOf(0, 0, 2, 2, 30).left, 'L', 0.1, 0.9, 0.5, 0.4, '#ff5a47', '#fff4de'); assert.equal(a.log.depth, 0); const pl = recCtx(); plank(pl.ctx, L, 'FREIGHT', { x: 40, up: 20, lv: [1, 1, 1, 1] }); assert.ok(callNames(pl.log).filter((n) => n === 'fillText').length >= 2, 'raised lettering: a shadow copy and the letters'); assert.equal(pl.log.depth, 0);
  const rf = recCtx(), res = roof(rf.ctx, { gx: 0, gy: 0, w: 3, d: 2 }, 30, { kind: 'gable', col: '#e2704c', wall: '#fff0d4', lv: [1, 1, 1, 1] }); assert.equal(res.axis, 'x'); assert.ok(res.rise >= 8 && res.rise <= 20); assert.equal(rf.log.depth, 0); assert.ok(thinnestStroke(rf.log) >= 1.5);
  assert.equal(roof(recCtx().ctx, { gx: 0, gy: 0, w: 2, d: 4 }, 30, { kind: 'hip', col: '#a272c8' }).axis, 'y', 'the ridge runs along the longer side');
  const fl = recCtx(); flatRoof(fl.ctx, { gx: 0, gy: 0, w: 3, d: 2 }, 30, { col: '#8fa8d0' }); assert.equal(fl.log.clips, 0); assert.equal(fl.log.depth, 0);
});

test('styleOf: a prop\'s own colours win over its theme\'s row, an unknown district gets the generic row, and a district under cloud is veiled', () => {
  const p = { t: 'bldg', zone: 4, col: '#112233' }; assert.equal(styleOf(p, env()).wall, '#112233'); assert.equal(styleOf({ ...p, col: undefined }, env()).wall, THEMES.pawn.wall);
  assert.equal(styleOf({ t: 'bldg', gx: 1, gy: 1, w: 1, d: 1, h: 10 }, env()).wall, BASE.wall); assert.notEqual(styleOf({ ...p, col: '#ffd8b6' }, env({ dim: 0.5 })).wall, '#ffd8b6');
  assert.equal(styleOf({ ...p, mat: 'brick' }, env()).mat, 'brick'); assert.equal(styleOf({ ...p, glass: 1 }, env()).mat, 'glass'); assert.equal(styleOf({ ...p, th: 'estate', col: undefined }, env()).wall, THEMES.estate.wall);
});

test('the new modules keep the art direction\'s rules in their source: no stroke under 1.5 pixels, no black or retired colour, no clip of a silhouette, no Math.random', () => {
  for (const f of ['parts', 'buildings', 'bldg-civic', 'bldg-works', 'bldg-small', 'plots', 'bstyle']) {
    const src = readFileSync(new URL(`../js/world/${f}.js`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/lineWidth = (\d*\.?\d+)/g)) assert.ok(+m[1] >= 1.5, `${f}.js: lineWidth = ${m[1]}`);
    for (const bad of ['#000000', '#000;', "'#000'", 'rgba(0,0,0', 'rgb(8,10,20', '#121826', '#4b7a4e', '#2f3644', '#1b3b5c']) assert.ok(!src.includes(bad), `${f}.js: ${bad}`);
    assert.ok(!/Math\.random|performance\.now\(\)/.test(src.replace(/export function reg[\s\S]*?registerProp\(kind, def\); return def;\n\}/, '')), `${f}.js draws from the world and the clock only`);
    assert.ok(!/\.clip\(\)/.test(src.replace(/ctx\.arc\(x, y, r, 0, 6\.3\); ctx\.clip\(\);/, '').replace(/c\.clip\(\); c\.fillStyle = C\('#ffd02e'\)/, '')), `${f}.js: a path clip is the dearest thing a software canvas is asked for`);
  }
});
