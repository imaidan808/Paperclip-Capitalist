// The two static layers (T3's buildings, T4's everything else) against the modules that draw the props: the building list is the one module's, every one of the 61 kinds belongs to exactly one layer,
// drawProp takes a kind's V2 drawer when (and only when) its layer is flagged, and a sprite belongs to the layer definition that drew it. A separate file so that props-buildings.js is the FIRST prop module
// this process loads (node runs each test file in its own process), which is how the kinds each module registers are told apart.
import test from 'node:test';
import assert from 'node:assert/strict';

const common = await import('../js/world/props-common.js'), before = new Set(Object.keys(common.DRAW));
await import('../js/world/props-buildings.js');
const fromBuildings = Object.keys(common.DRAW).filter((k) => !before.has(k)).sort();
const { DRAW } = await import('../js/world/props.js'), stack = await import('../js/world/stack.js'), sprites = await import('../js/world/sprites.js'), { drawProp } = await import('../js/world/props.js');

test('the building layer is exactly the kinds props-buildings.js registers (T3\'s module), and every other kind is T4\'s', () => {
  assert.deepEqual([...stack.BUILDING_KINDS].sort(), fromBuildings);
  assert.equal(Object.keys(DRAW).length, 61, 'the DRAW table has the same 61 kinds as before the split');
  const bldg = Object.keys(DRAW).filter((k) => stack.staticLayerOf(k) === 'static-bldg'), prop = Object.keys(DRAW).filter((k) => stack.staticLayerOf(k) === 'static-prop');
  assert.equal(bldg.length, 18); assert.equal(prop.length, 43); assert.equal(new Set([...bldg, ...prop]).size, 61, 'no kind is in both layers, none in neither');
});

/** A recording context whose getTransform says a plain scale `a` (the sprite cache reads it). */
function rec(a = 1) { const calls = [], t = { getTransform: () => ({ a, b: 0, c: 0, d: a, e: 0, f: 0 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }; return { calls, ctx: new Proxy(t, { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (...args) => { calls.push([k, ...args]); }), set: (o, k, v) => { o[k] = v; return true; } }) }; }
const env = (o = {}) => ({ t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, ...o });
const bench = { t: 'bench', gx: 4, gy: 4, w: 1, d: 0.4, h: 10, z: 0, bb: [-40, 100, 40, 140], col: '#cc8f50' }, tower = { t: 'tower', gx: 10, gy: 10, w: 2, d: 2, h: 90, z: 0, bb: [-100, 200, 100, 400], col: '#8a94a8', color: '#4a8fb0', seed: 2 };

test('drawProp draws the legacy drawer until a kind\'s V2 drawer is registered AND its own layer is flagged; one owner\'s flag never moves the other\'s kinds', () => {
  stack.setFlags('all:legacy'); const seen = [];
  stack.registerProp('bench', (ctx, p) => { seen.push('v2 bench'); return [[[1, 1]]]; }); stack.registerProp('tower', (ctx, p) => { seen.push('v2 tower'); return [[[2, 2]]]; });
  const g = rec(); drawProp(g.ctx, bench, env()); drawProp(g.ctx, tower, env()); assert.deepEqual(seen, [], 'registered but not flagged: the legacy drawers drew');
  assert.ok(g.calls.length > 0, 'and the legacy drawers really drew something');
  stack.setFlag('static-prop', 'v2'); seen.length = 0; const a = rec();
  assert.deepEqual(drawProp(a.ctx, bench, env()), [[[1, 1]]]); drawProp(a.ctx, tower, env()); assert.deepEqual(seen, ['v2 bench'], 'T4\'s flag moved T4\'s kind and not T3\'s');
  stack.setFlag('static-bldg', 'v2'); seen.length = 0; assert.deepEqual(drawProp(a.ctx, tower, env()), [[[2, 2]]]); assert.deepEqual(seen, ['v2 tower']);
  stack.setFlags('all:legacy'); seen.length = 0; drawProp(rec().ctx, tower, env()); assert.deepEqual(seen, [], 'flipped back');
});
test('a V2 layer definition is served through the sprite cache like a legacy layer, and a sprite built by one definition is never served for another', async () => {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return (this.ctx ||= rec(1).ctx); } transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; } };
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); stack.setFlags('all:legacy');
  let oldBodies = 0, newBodies = 0; const p = { ...tower, t: 'shack', bb: [-60, 200, 60, 300] }, saved = common.LAYER.shack, savedDraw = DRAW.shack;
  common.LAYER.shack = { body: () => { oldBodies++; return null; }, night: false }; common.LAYER.shack.draw = DRAW.shack = (c, q, e) => common.LAYER.shack.body(c, q, e);
  stack.registerProp('shack', { body: () => { newBodies++; return [[[3, 3]]]; }, night: false });
  const g = rec(1.3); drawProp(g.ctx, p, env()); assert.equal(oldBodies, 1, 'the first sight of a new scale is drawn directly');
  return new Promise((r) => setTimeout(r, 120)).then(() => {
    drawProp(g.ctx, p, env()); assert.equal(oldBodies, 2, 'the scale has rested: the legacy body is built once as a sprite'); drawProp(g.ctx, p, env()); assert.equal(oldBodies, 2, 'and blitted after');
    stack.setFlag('static-bldg', 'v2'); const polys = drawProp(g.ctx, p, env()); assert.equal(newBodies, 1, 'the V2 body is built as its own sprite, not served the legacy one'); assert.deepEqual(polys, [[[3, 3]]]); assert.equal(oldBodies, 2);
    drawProp(g.ctx, p, env()); assert.equal(newBodies, 1, 'then blitted'); stack.setFlag('static-bldg', 'legacy'); drawProp(g.ctx, p, env()); assert.equal(oldBodies, 2, 'flipping back finds the legacy sprite still there');
    common.LAYER.shack = saved; DRAW.shack = savedDraw; sprites.clearSprites(); stack.setFlags('all:legacy'); delete globalThis.OffscreenCanvas;
  });
});
test('layer() keeps every field of a definition, `detail` included: the overlay bands wait in the table until sprites.js builds them', () => {
  const def = { body: () => null, detail: [{ band: 'near', body() {} }, { band: 'close', body() {} }], pad: [1, 2, 3, 4] }; common.layer('__probe', def);
  assert.equal(common.LAYER.__probe, def); assert.equal(common.LAYER.__probe.detail.length, 2); assert.equal(typeof common.DRAW.__probe, 'function'); delete common.LAYER.__probe; delete common.DRAW.__probe;
});
