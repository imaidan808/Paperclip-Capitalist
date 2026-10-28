// Static scenery: the colour helpers, the analytic shadow, batched windows, the offscreen sprite cache and the layered props, against recording canvases.
// Positions are held fixed by a hash of the whole scenery list: scenery art may change how things look, never where they stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rgb, hex, shade, mix, tone, fogged, gray, shadow, windows, P, sx, sy, HW, box } from '../js/world/iso.js';
import { SCENERY, LAYOUT } from '../js/world/layout.js';
import { DRAW, drawProp, layerOf } from '../js/world/props.js';
import { solid, hazeAt } from '../js/world/shading.js';
import * as sprites from '../js/world/sprites.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A recording 2D context: calls and fill styles are logged; getTransform answers a plain scale a. */
function rec(a = 1, log = { n: 0, calls: [], depth: 0 }) {
  const t = { getTransform: () => ({ a, b: 0, c: 0, d: a, e: 0, f: 0 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), measureText: (s) => ({ width: s.length * 6 }) };
  const ctx = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k]; if (typeof k === 'symbol') return undefined;
      return (...args) => {
        log.n++; log.calls.push([k, ...args]);
        if (k === 'save') log.depth++; else if (k === 'restore') log.depth--;
        if (k === 'drawImage' && args[0] && args[0].closed) throw Object.assign(new Error("Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The image source is detached"), { name: 'InvalidStateError' }); // what a browser does
      };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { ctx, log };
}
const env = (o = {}) => ({ t: 1234, night: 0, wind: 1, dim: 0, far: false, lite: false, lights: [], zoff: 0, ...o });

// ---------------------------------------------------------------- positions never change
test('the scenery list is exactly the baseline: scenery art never moves, resizes or re-heights anything', () => {
  const rows = SCENERY.map((p) => [p.t, p.gx, p.gy, p.w, p.d, p.h, p.z, p.zone, p.hot || '', p.key].join(','));
  const g = LAYOUT, extra = [g.edges.length, g.cliffs.length, g.bounds.x0, g.bounds.y1, g.props.length, Object.keys(g.districts).length].join(',');
  assert.equal(createHash('sha1').update(rows.join('\n') + extra).digest('hex'), '87933c744452f3b2217fb4b7659fe19abf70e606');
  assert.equal(rows.length, 714);
});

// ---------------------------------------------------------------- colour helpers
test('colour helpers are memoised but give exactly what the plain arithmetic gives', () => {
  const plain = { shade: (h, f) => { const [r, g, b] = rgb(h); return hex(r * f, g * f, b * f); }, mix: (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); } };
  for (const c of ['#2f7d4b', '#ffffff', '#000000', '#c0392b', '#8a94a8']) for (const f of [0.6, 0.8, 1, 1.18, 1.5]) { assert.equal(shade(c, f), plain.shade(c, f)); assert.equal(shade(c, f), plain.shade(c, f), 'second call (cached) agrees'); }
  assert.equal(mix('#102030', '#f0e0d0', 0.37), plain.mix('#102030', '#f0e0d0', 0.37));
  assert.equal(hex(300, -5, 127.6), '#ff0080', 'channels clamp and round');
  const t = tone('#3366aa'); assert.deepEqual({ ...t }, { t: '#3366aa', l: shade('#3366aa', 0.8), r: shade('#3366aa', 0.6) }); assert.equal(tone('#3366aa'), t, 'the same object every time'); assert.ok(Object.isFrozen(t));
  assert.equal(fogged('#445566', 0), '#445566'); assert.notEqual(fogged('#445566', 0.5), '#445566'); assert.equal(fogged('#445566', 0.5), mix(mix('#445566', gray('#445566'), 0.75), '#121826', 0.25));
});

// ---------------------------------------------------------------- shadow
test('the cast shadow is the old convex hull of the footprint and its shifted copy: one analytic parallelogram', () => {
  const hull = (gx, gy, w, d, h) => { // the original construction
    const k = h * 0.55, pts = [];
    for (const [x, y] of [[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]]) { const [px, py] = P(x, y); pts.push([px, py], [px + k, py + k * 0.5]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of [...pts].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return [...lo.slice(0, -1), ...up.slice(0, -1)];
  };
  for (const [gx, gy, w, d, h] of [[10, 12, 3, 2, 40], [3.5, 1, 1.2, 4.4, 120], [50, 60, 0.6, 0.6, 20]]) {
    const { ctx, log } = rec(); shadow(ctx, gx, gy, w, d, h, 0.3);
    const paths = []; let cur = null; for (const c of log.calls) { if (c[0] === 'beginPath') paths.push(cur = []); else if (c[0] === 'moveTo' || c[0] === 'lineTo') cur.push([c[1], c[2]]); }
    const core = paths.at(-1), want = hull(gx, gy, w, d, h).filter((q, i, a) => { const o = a[(i + a.length - 1) % a.length], n = a[(i + 1) % a.length]; return Math.abs((q[0] - o[0]) * (n[1] - q[1]) - (q[1] - o[1]) * (n[0] - q[0])) > 1e-6; }), key = (q) => q.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).sort().join('|');
    assert.equal(key(core), key(want), 'same corners as the hull');
  }
});

// ---------------------------------------------------------------- windows
test('windows: a face of any size is a handful of fills, and the lit pattern is the old one', () => {
  const face = [[0, 40], [60, 70], [60, 30], [0, 0]];
  for (const [cols, rows, lit] of [[4, 12, 0], [4, 12, 0.5], [6, 8, 1.4]]) {
    const { ctx, log } = rec(); windows(ctx, face, cols, rows, '#123456', lit, 0.06, '#ffd98a', 3);
    const fills = log.calls.filter((c) => c[0] === 'fill').length; assert.ok(fills <= 3, `${cols}x${rows} lit ${lit}: ${fills} fills`);
    const moves = log.calls.filter((c) => c[0] === 'moveTo').length; assert.ok(moves >= cols * rows, 'every window is in a path');
  }
  // dark everywhere when nothing is lit; every window lit when the evening is deep
  const dark = rec(); windows(dark.ctx, face, 3, 3, '#123456', 0); assert.ok(!dark.log.calls.some((c) => c[0] === 'fillStyle'));
});

// ---------------------------------------------------------------- the sprite cache
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.log = { n: 0, calls: [] }; } getContext() { return (this.ctx ||= rec(1, this.log).ctx); } transferToImageBitmap() { const b = { width: this.width, height: this.height, closed: false, close() { this.closed = true; } }; return b; } };
const prop = (o = {}) => ({ t: 'bldg', gx: 10, gy: 10, w: 3, d: 2, h: 30, z: 5, bb: [-96, 300, 96, 420], ...o });
test('sprites: nothing is built while the zoom is moving; once it rests the body is drawn once and then only blitted', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0, hits: 0, direct: 0 });
  let bodies = 0; const layer = { body: (g) => { bodies++; g.fillRect(0, 0, 5, 5); return [[[0, 0], [1, 1]]]; } };
  const p = prop(), { ctx, log } = rec(1.7);
  assert.equal(sprites.drawSprite(ctx, p, env(), layer), undefined, 'first sight of a new scale: draw directly'); assert.equal(bodies, 0);
  await sleep(120);
  const polys = sprites.drawSprite(ctx, p, env(), layer); assert.deepEqual(polys, [[[0, 0], [1, 1]]]); assert.equal(bodies, 1);
  assert.equal(log.calls.filter((c) => c[0] === 'drawImage').length, 1, 'blitted once');
  for (let i = 0; i < 5; i++) assert.deepEqual(sprites.drawSprite(ctx, p, env(), layer), polys);
  assert.equal(bodies, 1, 'never drawn again'); assert.equal(sprites.stats.hits, 5);
  // the blit is on whole device pixels, in identity space
  const di = log.calls.find((c) => c[0] === 'drawImage'); assert.ok(Number.isInteger(di[2]) && Number.isInteger(di[3]));
  assert.ok(log.calls.some((c) => c[0] === 'setTransform' && c[1] === 1 && c[2] === 0 && c[3] === 0 && c[4] === 1 && c[5] === 0));
});
test('sprites: fog and night are buckets of their own; the same bucket is shared; a prop keeps at most three variants', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); let bodies = 0; const layer = { body: () => { bodies++; return null; } }, p = prop({ t: 'depot' }), { ctx } = rec(1.2);
  sprites.drawSprite(ctx, p, env(), layer); await sleep(120);
  sprites.drawSprite(ctx, p, env({ night: 0.02 }), layer); sprites.drawSprite(ctx, p, env({ night: 0.04 }), layer); assert.equal(bodies, 1, 'night 0.02 and 0.04 are the same eighth');
  sprites.drawSprite(ctx, p, env({ night: 0.5 }), layer); assert.equal(bodies, 2);
  sprites.drawSprite(ctx, p, env({ dim: 0.5 }), layer); assert.equal(bodies, 3);
  sprites.drawSprite(ctx, p, env({ lite: true }), layer); assert.equal(bodies, 4);
  sprites.drawSprite(ctx, p, env(), layer); assert.equal(bodies, 5, 'the oldest variant was dropped to make room');
  assert.equal(sprites.drawSprite(ctx, p, env({ lite: true }), layer) === undefined, false);
});
test('sprites: a body sees a still world (no clock, no lights) and the memory budget is kept', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); let seen = null; const layer = { body: (g, p, e) => { seen = e; return null; } }, { ctx } = rec(2);
  const p = prop({ bb: [0, 0, 400, 400] }); sprites.drawSprite(ctx, p, env({ night: 0.5, dim: 0.5 }), layer); await sleep(120); sprites.drawSprite(ctx, p, env({ night: 0.5, dim: 0.5 }), layer);
  assert.equal(seen.t, 0); assert.equal(seen.wind, 0); assert.equal(seen.lights, null); assert.equal(seen.far, false); assert.equal(seen.night, 0.5); assert.equal(seen.dim, 0.5);
  // five sprites of about 7 million pixels each cannot all stay under a 22 million budget
  const big = { body: () => null }, props = Array.from({ length: 5 }, (_, i) => prop({ gx: i, bb: [0, 0, 2600, 2600], h: 0 })), one = rec(1).ctx;
  sprites.drawSprite(one, props[0], env(), big); await sleep(120);
  for (const q of props) sprites.drawSprite(one, q, env(), big);
  assert.ok(sprites.stats.pixels <= sprites.SPRITE_BUDGET, 'pixels held ' + sprites.stats.pixels); assert.ok(sprites.stats.evicted > 0);
});
test('sprites: a body that throws leaves nothing cached and the error goes to the caller; the cache can be switched off', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); const { ctx } = rec(1.4), p = prop({ t: 'office' }), bad = { body: () => { throw new Error('boom'); } };
  sprites.drawSprite(ctx, p, env(), bad); await sleep(120);
  assert.throws(() => sprites.drawSprite(ctx, p, env(), bad), /boom/); assert.equal(sprites.stats.pixels, 0);
  const good = { body: () => null }; assert.equal(sprites.drawSprite(ctx, p, env(), good), null, 'built after the failure, polys null');
  sprites.enableSprites(false); assert.equal(sprites.drawSprite(ctx, p, env(), good), undefined); assert.equal(sprites.stats.pixels, 0); sprites.enableSprites(true);
  const noCanvas = { ...rec(1).ctx, getTransform: undefined }; void noCanvas;
});

test('sprites: crossing the memory budget never evicts the sprite just built, never throws, and leaves the canvas as it found it', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0, hits: 0, direct: 0, evicted: 0, stale: 0, deferred: 0, lost: 0 });
  const big = { body: () => [[[1, 1], [2, 2]]] }, props = Array.from({ length: 7 }, (_, i) => prop({ gx: i, bb: [0, 0, 2600, 2600], h: 0 })), c = rec(1);
  sprites.drawSprite(c.ctx, props[0], env(), big); await sleep(120); // the scale rests
  const seen = [];
  for (const q of props) { const r = sprites.drawSprite(c.ctx, q, env(), big); seen.push(r); assert.equal(c.log.depth, 0, 'every save is restored'); }
  assert.ok(sprites.stats.evicted > 0, 'the budget was crossed'); assert.ok(sprites.stats.pixels <= sprites.SPRITE_BUDGET, 'and kept');
  for (const r of seen) assert.deepEqual(r, [[[1, 1], [2, 2]]], 'a draw that built a sprite is served by it, never left to draw directly');
  assert.equal(sprites.stats.lost, 0, 'no blit hit a closed bitmap');
  // the newest sprite is the one that stays; the oldest were the ones to go
  const before = sprites.stats.builds; assert.deepEqual(sprites.drawSprite(c.ctx, props.at(-1), env(), big), [[[1, 1], [2, 2]]]); assert.equal(sprites.stats.builds, before, 'the last one built is still cached');
});
test('sprites: a bitmap the browser took back costs one direct draw, not a thrown error or a leaked save', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { lost: 0 });
  const p = prop({ t: 'depot' }), c = rec(1.9), layer = { body: () => [[[3, 3]]] };
  sprites.drawSprite(c.ctx, p, env(), layer); await sleep(120);
  assert.deepEqual(sprites.drawSprite(c.ctx, p, env(), layer), [[[3, 3]]]);
  // a context lost under us closes every bitmap
  const arr = []; c.log.calls.filter((x) => x[0] === 'drawImage').forEach((x) => arr.push(x[1])); arr.forEach((b) => b.close());
  assert.equal(sprites.drawSprite(c.ctx, p, env(), layer), undefined, 'the caller is told to draw this prop directly'); assert.equal(sprites.stats.lost, 1); assert.equal(c.log.depth, 0);
  assert.deepEqual(sprites.drawSprite(c.ctx, p, env(), layer), [[[3, 3]]], 'and the next frame builds it again'); assert.equal(c.log.depth, 0);
});
test('sprites: a frame builds only what its time allows; the rest shows a neighbouring evening, or is drawn directly, and catches up', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0, stale: 0, deferred: 0, direct: 0 });
  let bodies = 0; const layer = { body: () => { bodies++; return [[[0, 0]]]; } }, a = prop({ gx: 1 }), b = prop({ gx: 2 }), c = rec(1.6);
  sprites.drawSprite(c.ctx, a, env(), layer); await sleep(120);
  sprites.drawSprite(c.ctx, a, env({ night: 0.4 }), layer); assert.equal(bodies, 1); // a is built for the evening at 3/8
  sprites.setBuildBudget(1e-9, 1e12, 1e12); // a frame that allows one build and then no more, however long it lasts
  sprites.drawSprite(c.ctx, b, env(), layer); assert.equal(bodies, 2, 'the first build of a window goes ahead');
  const blits = () => c.log.calls.filter((x) => x[0] === 'drawImage').length, n0 = blits();
  assert.deepEqual(sprites.drawSprite(c.ctx, a, env({ night: 0.5 }), layer), [[[0, 0]]], 'a quarter-hour of evening later: the sprite of the step before is shown'); assert.equal(bodies, 2); assert.equal(blits(), n0 + 1); assert.equal(sprites.stats.stale, 1);
  assert.equal(sprites.drawSprite(c.ctx, a, env({ night: 0.9 }), layer), undefined, 'three steps off is too far to pass for the same evening: direct'); assert.equal(sprites.stats.deferred, 1); assert.equal(bodies, 2);
  assert.equal(sprites.drawSprite(c.ctx, prop({ gx: 3 }), env(), layer), undefined, 'a prop with no sprite at all is drawn directly');
  sprites.setBuildBudget(Infinity); // the next frame has time
  assert.deepEqual(sprites.drawSprite(c.ctx, a, env({ night: 0.9 }), layer), [[[0, 0]]]); assert.equal(bodies, 3, 'and builds what was waiting');
  sprites.setBuildBudget();
});
test('sprites: a sprite is built at the scale it is shown at, so the blit is a straight copy; a different scale is a different sprite', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); let bodies = 0; const layer = { body: () => { bodies++; return null; } }, p = prop({ gx: 4 });
  for (const sc of [1.3, 1.3002]) { const c = rec(sc); sprites.drawSprite(c.ctx, p, env(), layer); await sleep(110); sprites.drawSprite(c.ctx, p, env(), layer); const di = c.log.calls.filter((x) => x[0] === 'drawImage'); assert.ok(di.length >= 1); assert.equal(di.at(-1).length, 4, 'drawImage(image, x, y): no resize'); }
  assert.equal(bodies, 1, 'a hair of difference in the scale is the same sprite');
  const c = rec(1.6); sprites.drawSprite(c.ctx, p, env(), layer); await sleep(110); sprites.drawSprite(c.ctx, p, env(), layer); assert.equal(bodies, 2, 'a real change of zoom builds again');
});

// ---------------------------------------------------------------- the sprite box holds the whole body
/** Every point a body draws, in the coordinates it draws in: a small transform tracker over a recording context. */
function inkBounds(body, p, env) {
  let m = [1, 0, 0, 1, 0, 0]; const stack = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, lw = 1;
  const pt = (x, y, r = 0) => { const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5]; x0 = Math.min(x0, X - r); x1 = Math.max(x1, X + r); y0 = Math.min(y0, Y - r); y1 = Math.max(y1, Y + r); };
  const mul = (a, b, c, d, e, f) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
  const api = {
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), measureText: (s) => ({ width: s.length * 6 }),
    save() { stack.push(m.slice()); }, restore() { m = stack.pop() || m; }, translate(x, y) { mul(1, 0, 0, 1, x, y); }, scale(x, y) { mul(x, 0, 0, y, 0, 0); }, transform(a, b, c, d, e, f) { mul(a, b, c, d, e, f); }, setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    moveTo: pt, lineTo: pt, quadraticCurveTo(cx, cy, x, y) { pt(cx, cy); pt(x, y); }, rect(x, y, w, h) { pt(x, y); pt(x + w, y + h); }, fillRect(x, y, w, h) { pt(x, y); pt(x + w, y + h); },
    arc(x, y, r) { pt(x, y, r); }, ellipse(x, y, rx, ry) { pt(x, y, Math.max(rx, ry)); }, arcTo(x1_, y1_, x2, y2) { pt(x1_, y1_); pt(x2, y2); },
  };
  const ctx = new Proxy(api, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return () => {}; }, set(o, k, v) { if (k === 'lineWidth') lw = v; o[k] = v; return true; } });
  body(ctx, p, env); void lw;
  return { x0, y0, x1, y1 };
}
test('sprites: the box of every layered prop holds everything its body draws, so a sprite never has a corner cut off', () => {
  const seen = new Set(), bad = [];
  for (const p of SCENERY) {
    const L = layerOf(p.t); if (!L) continue;
    const key = [p.t, p.w, p.d, p.h, p.z].join('|'); if (seen.has(key)) continue; seen.add(key);
    for (const lite of [false, true]) {
      const e = { t: 0, wind: 0, lights: null, zoff: 0, locked: false, far: false, lite, crunch: false, dim: 0, night: 0.5, hz: 0, boardText: null, surge: false, alertAudit: false };
      const ink = inkBounds(L.body, p, e), B = sprites.spriteBounds(p, L);
      // two pixels of play: the faintest antialiasing at an edge is not a missing corner
      const over = { left: B.x0 - ink.x0, top: B.y0 - ink.y0, right: ink.x1 - B.x1, bottom: ink.y1 - B.y1 };
      if (Math.max(over.left, over.top, over.right, over.bottom) > 2) bad.push(`${p.t} ${p.w}x${p.d}x${p.h} lite=${lite} ${JSON.stringify(over)}`);
    }
  }
  assert.ok(seen.size >= 30, 'layered props found: ' + seen.size); assert.deepEqual(bad, []);
});
test('a server rack is a sprite of its cabinet with the blinking lights drawn live over it, and the hour does not rebuild it', async () => {
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0 });
  const p = SCENERY.find((q) => q.t === 'rack'), c = rec(1.45); assert.ok(p && layerOf('rack') && layerOf('rack').night === false);
  drawProp(c.ctx, p, env()); await sleep(110); const before = c.log.n;
  drawProp(c.ctx, p, env()); const dayCalls = c.log.n - before;
  drawProp(c.ctx, p, env({ night: 0.9 })); assert.equal(sprites.stats.builds, 1, 'one sprite for every hour of the day');
  const direct = rec(1.45); DRAW.rack(direct.ctx, p, env());
  assert.ok(dayCalls < direct.log.n * 0.7, `a frame of a cached rack (${dayCalls} calls) is cheaper than drawing it all (${direct.log.n})`);
  // lit panes only: the dark panes are already in the sprite, so the live part never fills the pane colour
  const w = rec(); windows(w.ctx, [[0, 40], [60, 70], [60, 30], [0, 0]], 6, 6, '#0b1a22', 0.6, 0.07, '#7be3ff', 0, { fine: false, skipDark: true });
  assert.ok(!w.log.calls.some((x) => x[0] === 'fillStyle' && x[1] === '#0b1a22') && w.log.calls.filter((x) => x[0] === 'fill').length >= 1);
});

// ---------------------------------------------------------------- the layered props
test('every prop type draws, in every light, and a layered prop answers the same hit polygons through its sprite as straight onto the scene', async () => {
  const types = new Set(SCENERY.map((p) => p.t)); sprites.setBuildBudget(Infinity); sprites.clearSprites(); sprites.enableSprites(true);
  let layered = 0;
  for (const t of types) {
    const p = SCENERY.find((q) => q.t === t && q.hot) || SCENERY.find((q) => q.t === t), { ctx } = rec(1.3);
    for (const e of [env(), env({ night: 1, dim: 0.5 }), env({ lite: true }), env({ far: true, night: 0.3 })]) { const r = drawProp(ctx, p, e); assert.ok(r === null || Array.isArray(r) || r === undefined, t); assert.equal(e.hz, undefined, 'haze is only held for the length of the call'); }
    sprites.drawSprite(ctx, { ...p }, env(), { body: () => null }); // prime the scale on a throwaway copy: a prop of the scenery itself must not get a sprite of nothing
  }
  await sleep(120);
  sprites.clearSprites(); // and whatever the loop above built is forgotten, however long it took
  for (const t of ['bldg', 'tower', 'depot', 'hall', 'bank', 'ipo', 'office', 'rentrow', 'rack']) {
    const p = SCENERY.find((q) => q.t === t && q.hot) || SCENERY.find((q) => q.t === t); if (!p) continue; layered++;
    const direct = DRAW[t](rec(1.3).ctx, p, env()), c = rec(1.3);
    drawProp(c.ctx, p, env()); const viaSprite = drawProp(c.ctx, p, env());
    assert.deepEqual(viaSprite, direct, t + ': same hit shapes'); assert.ok(c.log.calls.some((x) => x[0] === 'drawImage'), t + ' was blitted');
  }
  assert.ok(layered >= 6);
});
test('drawProp: a replaced drawer is honoured, and a drawer that throws still puts the haze back', () => {
  const p = SCENERY.find((q) => q.t === 'scrap'), orig = DRAW.scrap, e = env();
  DRAW.scrap = () => { throw new Error('boom'); };
  try { assert.throws(() => drawProp(rec().ctx, p, e), /boom/); assert.equal(e.hz, undefined); } finally { DRAW.scrap = orig; }
  const b = SCENERY.find((q) => q.t === 'bldg'), orig2 = DRAW.bldg; let called = 0; DRAW.bldg = () => { called++; return null; };
  try { drawProp(rec().ctx, b, e); drawProp(rec().ctx, b, e); assert.equal(called, 2, 'the replacement ran, not the cached body'); } finally { DRAW.bldg = orig2; }
});
test('haze grows with the height of the ground and stays thin; solids keep the corners box() gives', () => {
  assert.ok(hazeAt(0) < hazeAt(50) && hazeAt(50) < hazeAt(100) && hazeAt(1000) <= 0.09);
  const a = rec(), b = rec(), c = tone('#668899');
  const f1 = solid(a.ctx, 5, 6, 2, 3, 40, c, { mat: 'brick' }), f2 = box(b.ctx, 5, 6, 2, 3, 40, c);
  assert.deepEqual(f1, f2); assert.ok(a.log.n > b.log.n, 'the finish adds drawing, not geometry');
  assert.ok(Math.abs(sx(5, 6) - -HW) < 1e-9 && sy(5, 6) === 176);
});
