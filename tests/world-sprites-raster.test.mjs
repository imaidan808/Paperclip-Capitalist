// T5 raster quality: the sprite cache's pixel policy (js/world/sprites.js): the raster phase, sealing, overlays and the governor's tiers, the crossfade, the ledger and the plan's budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sprites from '../js/world/sprites.js';
import { ledger } from '../js/world/gfx.js';
import { lodOf } from '../js/world/lod.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A canvas the sprite builder can draw on: records setTransform and the blits, and can hand back real pixels with cracks to seal. */
function installCanvas(opt = {}) {
  const made = [];
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.sets = []; this.put = 0; made.push(this); }
    getContext() {
      const me = this, calls = [];
      return (this.ctx ||= new Proxy({ calls, sets: this.sets, getImageData: opt.pixels ? (x, y, w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { d[i * 4 + 3] = 255; } for (let y2 = 0; y2 < h; y2++) { const i = (y2 * w + Math.floor(w / 2)) * 4 + 3; d[i] = 191; } return { data: (me.data = d), width: w, height: h }; } : undefined, putImageData: opt.pixels ? () => { me.put++; } : undefined, createLinearGradient: () => ({ addColorStop() {} }) }, {
        get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; if (k === 'getImageData' || k === 'putImageData') return undefined; return (...a) => { if (k === 'setTransform') o.sets.push(a); }; },
        set(o, k, v) { o[k] = v; return true; },
      }));
    }
    transferToImageBitmap() { return { width: this.width, height: this.height, close() { this.closed = true; } }; }
  };
  return made;
}
/** The target context: getTransform answers the scale and a whole-pixel translation; every call is recorded. */
function target(a = 1, e = 0, f = 0) {
  const calls = [], stack = [], t = { getTransform: () => ({ a, b: 0, c: 0, d: a, e, f }), globalAlpha: 1 };
  const ctx = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...args) => { if (k === 'save') stack.push(o.globalAlpha); else if (k === 'restore') o.globalAlpha = stack.pop() ?? 1; calls.push([k, ...args, o.globalAlpha]); }; }, set(o, k, v) { o[k] = v; return true; } });
  return { ctx, calls, set alpha(v) { t.globalAlpha = v; } };
}
const env = (o = {}) => ({ t: 0, night: 0, wind: 1, dim: 0, far: false, lite: false, lights: [], zoff: 0, tier: 0, lod: lodOf(1), ...o });
const prop = (o = {}) => ({ t: 'bldg', gx: 10, gy: 10, w: 3, d: 2, h: 30, z: 5, bb: [-96, 300, 96, 420], ...o });
const fresh = () => { sprites.setBuildBudget(Infinity); sprites.clearSprites(); sprites.setSpriteFade(120); Object.assign(sprites.stats, { builds: 0, hits: 0, direct: 0, evicted: 0, stale: 0, deferred: 0, lost: 0, overlays: 0, sealed: 0, faded: 0, buckets: 0 }); };

test('the plan\'s budget: 8 million pixels at density 1, 12 million at density 2, and the ledger says what the cache holds', () => {
  fresh(); assert.equal(sprites.SPRITE_BUDGET, 8e6); sprites.setSpriteBudget(2); assert.equal(sprites.spriteBudget(), 12e6); sprites.setSpriteBudget(1); assert.equal(sprites.spriteBudget(), 8e6);
  installCanvas(); const c = target(1.5); sprites.settle(1.5); const p = prop(); sprites.drawSprite(c.ctx, p, env(), { body: () => null });
  assert.ok(sprites.stats.pixels > 0); assert.equal(ledger.total('sprites'), sprites.stats.pixels * 4, 'the ledger holds exactly the sprites\' pixels');
  sprites.clearSprites(); assert.equal(ledger.total('sprites'), 0, 'and nothing once they are cleared'); delete globalThis.OffscreenCanvas;
});

test('a sprite is built on the frame\'s raster phase: its origin is the whole device pixel the live art puts the world point on, and it lands on whole pixels', () => {
  fresh(); const made = installCanvas();
  for (const [a, e, f] of [[1.8, 333, -71], [0.9, -12, 40], [2.4, 1001, 7]]) {
    sprites.clearSprites(); made.length = 0; const c = target(a, e, f); sprites.settle(a); const p = prop({ bb: [-96.3, 300.7, 96, 420] }), B = sprites.spriteBounds(p, {});
    sprites.drawSprite(c.ctx, p, env(), { body: () => null });
    const x0 = B.x0 - 1, y0 = B.y0 - 1, tf = made[0].sets.find((s) => s[0] === a && s[3] === a);
    assert.ok(tf, `the body is drawn at the render scale ${a}`); assert.equal(tf[4], -Math.round(a * x0), 'x: minus the whole pixel the world x0 lands on'); assert.equal(tf[5], -Math.round(a * y0));
    const blit = c.calls.find((q) => q[0] === 'drawImage'); assert.equal(blit[2], Math.round(a * x0) + e, 'blitted at that pixel plus the camera\'s whole translation'); assert.equal(blit[3], Math.round(a * y0) + f); assert.equal(blit.length, 5, 'a straight copy (image, x, y)');
  }
  delete globalThis.OffscreenCanvas;
});

test('a pan does not move a cached prop against the ground: blits differ by exactly the camera\'s whole translation', () => {
  fresh(); installCanvas(); const p = prop(), layer = { body: () => null }, a = 1.7; sprites.settle(a);
  const xs = []; for (const e of [100, 101, 103, 140]) { const c = target(a, e, 5); sprites.drawSprite(c.ctx, p, env(), layer); xs.push(c.calls.find((q) => q[0] === 'drawImage')[2]); }
  assert.deepEqual(xs.map((x) => x - xs[0]), [0, 1, 3, 40], 'one pixel of pan is one pixel of sprite, never a rounding that ticks');
  delete globalThis.OffscreenCanvas;
});

test('sealing: a body\'s cracks are closed after it is drawn (and a layer can opt out); a slit stays', () => {
  fresh(); const made = installCanvas({ pixels: true });
  sprites.settle(1.3); const c = target(1.3); sprites.drawSprite(c.ctx, prop(), env(), { body: () => null });
  assert.equal(made[0].put, 1, 'the sealed pixels were put back'); assert.equal(sprites.stats.sealed, 1); assert.equal(made[0].data[(5 * made[0].width + Math.floor(made[0].width / 2)) * 4 + 3], 255, 'the crack column (alpha 0.75) is opaque now');
  sprites.clearSprites(); made.length = 0; sprites.drawSprite(c.ctx, prop(), env(), { body: () => null, seal: false }); assert.equal(made[0].put, 0, 'a layer that says seal: false is left as drawn');
  delete globalThis.OffscreenCanvas;
});

test('overlays: built only once the scale has rested and only for a band whose alpha is over the floor; blitted with the band\'s alpha; the base alone answers the hit shapes', () => {
  fresh(); installCanvas(); let base = 0, near = 0, close = 0; const layer = { body: () => { base++; return [[[1, 1]]]; }, detail: [{ band: 'near', body: () => { near++; } }, { band: 'close', body: () => { close++; } }] };
  const p = prop(), a = 1, lod = (z) => lodOf(z); sprites.settle(a);
  const t = target(a); const one = (z, tier = 0) => { t.calls.length = 0; const ev = env({ lod: lod(z), tier }); const polys = sprites.drawSprite(t.ctx, p, ev, layer); sprites.drawOverlays(t.ctx, p, ev, layer); return polys; };
  assert.deepEqual(one(0.2), [[[1, 1]]]); assert.equal(near + close, 0, 'far: no overlay is built (their alpha is under the floor)');
  one(1.0); assert.equal(near, 1, 'near is built at 1.0'); assert.equal(close, 0, 'close is not');
  const blits = t.calls.filter((q) => q[0] === 'drawImage'); assert.equal(blits.length, 2, 'base and near overlay'); assert.ok(blits[1].at(-1) < 1 + 1e-9 && blits[1].at(-1) > 0.9, 'the overlay is blitted with the band alpha (1.0 is fully near): ' + blits[1].at(-1));
  one(1.5); assert.equal(close, 1, 'close once the zoom is past 1.4'); one(1.5); assert.equal(near, 1); assert.equal(close, 1, 'never built twice'); assert.equal(base, 1);
  const mid = lodOf(1.4); one(1.4); const bl = t.calls.filter((q) => q[0] === 'drawImage'); assert.ok(Math.abs(bl.at(-1).at(-1) - 0.5) < 0.01 && Math.abs(mid.detail[3] - 0.5) < 0.01, 'in the middle of the crossfade the close marks are half in: ' + mid.detail[3] + ' / ' + bl.at(-1).at(-1));
  assert.equal(sprites.stats.overlays, 2);
  delete globalThis.OffscreenCanvas;
});

test('the governor lowers the band: at tier 3 close overlays are not built, at tier 5 near ones are not; the base is always complete', () => {
  fresh(); installCanvas(); let near = 0, close = 0; const layer = { body: () => null, detail: [{ band: 'near', body: () => { near++; } }, { band: 'close', body: () => { close++; } }] };
  const p = prop(), t = target(1); sprites.settle(1); const draw = (tier) => { const ev = env({ lod: lodOf(2), tier }); sprites.drawSprite(t.ctx, p, ev, layer); sprites.drawOverlays(t.ctx, p, ev, layer); };
  draw(5); assert.equal(near, 0); assert.equal(close, 0, 'tier 5: neither');
  sprites.clearSprites(); near = close = 0; draw(3); assert.equal(near, 1); assert.equal(close, 0, 'tier 3: near, no close');
  sprites.clearSprites(); near = close = 0; draw(2); assert.equal(near, 1); assert.equal(close, 1, 'tier 2: both');
  delete globalThis.OffscreenCanvas;
});

test('overlays are evicted before bases, and the overlay of one prop never counts against another layer\'s three variants', () => {
  fresh(); installCanvas(); sprites.setSpriteBudget(1);
  const layer = { body: () => null, detail: [{ band: 'near', body: () => {} }] }, t = target(1.2); sprites.settle(1.2);
  const ps = Array.from({ length: 6 }, (_, i) => prop({ gx: i, bb: [0, 0, 1500 + i, 900] })); // ~1.4 million pixels each
  for (const p of ps) { const ev = env({ lod: lodOf(1.2) }); sprites.drawSprite(t.ctx, p, ev, layer); sprites.drawOverlays(t.ctx, p, ev, layer); }
  assert.ok(sprites.stats.evicted > 0, 'the budget was crossed'); assert.ok(sprites.stats.pixels <= sprites.spriteBudget(), 'and kept: ' + sprites.stats.pixels);
  const surviving = (p) => { const ev = env({ lod: lodOf(1.2) }); return sprites.drawSprite(t.ctx, p, ev, layer) !== undefined; };
  assert.ok(ps.slice(-2).every(surviving), 'the bases of the last ones are still there');
  delete globalThis.OffscreenCanvas;
});

test('the exact sprite fades in over its stand-in when the clock runs, and replaces it at once when it does not (Calm, Off, reduced motion: env.t is 0)', async () => {
  for (const running of [true, false]) {
    fresh(); installCanvas(); const layer = { body: () => null }, p = prop(), t0 = target(1);
    sprites.settle(1); sprites.drawSprite(t0.ctx, p, env({ t: running ? 5 : 0 }), layer);                       // built at 1
    const t1 = target(1.1); sprites.drawSprite(t1.ctx, p, env({ t: running ? 5 : 0 }), layer);                 // the zoom just moved: the stand-in, scaled
    await sleep(110); const t2 = target(1.1); sprites.drawSprite(t2.ctx, p, env({ t: running ? 5 : 0 }), layer);  // rested: the exact sprite is built
    const blits = t2.calls.filter((q) => q[0] === 'drawImage');
    if (running) { assert.equal(blits.length, 2, 'the stand-in and the exact sprite'); assert.ok(blits[1].at(-1) < 1, 'the exact one is at part of its alpha: ' + blits[1].at(-1)); assert.equal(sprites.stats.faded, 1); await sleep(140); const t3 = target(1.1); sprites.drawSprite(t3.ctx, p, env({ t: 5 }), layer); assert.equal(t3.calls.filter((q) => q[0] === 'drawImage').length, 1, 'once the fade is over it is one blit'); }
    else { assert.equal(blits.length, 1, 'one blit: no fade under reduced motion'); assert.equal(sprites.stats.faded, 0); }
  }
  delete globalThis.OffscreenCanvas;
});

test('releasing gives every sprite back (World.release calls releaseAll, which calls the cache)', async () => {
  fresh(); installCanvas(); const c = target(1.4); sprites.settle(1.4); sprites.drawSprite(c.ctx, prop(), env(), { body: () => null }); assert.ok(sprites.stats.pixels > 0);
  const { releaseAll } = await import('../js/world/gfx.js'); releaseAll(); assert.equal(sprites.stats.pixels, 0); assert.equal(ledger.total('sprites'), 0);
  delete globalThis.OffscreenCanvas;
});
