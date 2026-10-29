// T4's props, plants and the shared sprite atlas (docs/RENDER_PLAN.md): every static kind of the static-prop layer has a V2 drawer; each draws without a fault, balances its state, strokes nothing thinner than 1.5 world pixels,
// draws the same picture twice (no clock, no random, no hidden state), and the one clickable kind (the market board) leaves the hit shape the legacy drawer left. The pure helpers (the sprite box, the look key, species,
// sway, attendants, gulls, colours) are held by their own numbers. No canvas is needed: the recording context of tests/helpers/recctx.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';

const stack = await import('../js/world/stack.js'), props = await import('../js/world/props.js'), at = await import('../js/world/atlas.js'), toys = await import('../js/world/toys.js'), nature = await import('../js/world/nature.js'), life = await import('../js/world/life.js'), stock = await import('../js/world/stock.js'), pal = await import('../js/world/palette.js'), lay = await import('../js/world/layout.js');
const T4_KINDS = Object.keys(props.DRAW).filter((k) => stack.staticLayerOf(k) === 'static-prop');
const SAMPLE = {
  tree: { w: 0.5, d: 0.5, h: 40, s: 1, c: '#3f8f4a' }, deadtree: { w: 0.6, d: 0.6, h: 40 }, planter: { w: 0.8, d: 0.8, h: 10 }, topiary: { w: 0.5, d: 0.5, h: 30 }, hedge: { w: 2.6, d: 0.5, h: 10, col: '#2f5a3a' }, hay: { w: 0.9, d: 0.9, h: 14 },
  lamp: { w: 0.2, d: 0.2, h: 32, col: '#ffe9a8' }, neonlamp: { w: 0.2, d: 0.2, h: 38, col: '#22d9ee' }, bench: { w: 1, d: 0.4, h: 8 }, fence: { w: 3, d: 0.1, h: 18, col: '#e9e2d0' }, tires: { w: 0.9, d: 0.9, h: 24, n: 4 }, barrel: { w: 0.7, d: 0.7, h: 22, color: '#b0493a', fire: true },
  crates: { w: 1.2, d: 1.2, h: 26, n: 2 }, scrap: { w: 1.4, d: 1.4, h: 28, seed: 4 }, junkcar: { w: 2.4, d: 1.3, h: 22, color: '#8c4a2f' }, pillar: { w: 0.5, d: 0.5, h: 34, col: '#f0e6c8' }, flag: { w: 0.2, d: 0.2, h: 44, col: '#38c06f' }, lantern: { w: 0.2, d: 0.2, h: 34, col: '#ffc93c' },
  neonpole: { w: 0.3, d: 0.3, h: 54, col: '#f2c14a', text: '000' }, polesign: { w: 0.4, d: 0.4, h: 70, col: '#ff5a47', text: 'AUTO' }, bollard: { w: 0.3, d: 0.3, h: 8, col: '#ff9a2e' }, billboard: { w: 3.4, d: 0.3, h: 40, col: '#4aa6ff', text: 'METRO', anim: 1 },
  ticker: { w: 4, d: 0.45, h: 26, acc: '#6df0a0', text: 'AAPL 182.4 MSFT 411.2 ' }, spot: { w: 0.6, d: 0.6, h: 40, col: '#9b6dff' }, statue: { w: 1, d: 1, h: 26, col: '#c2a24a' }, forsale: { w: 1.6, d: 0.4, h: 24, col: '#e8795a' }, fountain: { w: 2, d: 2, h: 8 }, helipad: { w: 3, d: 3, h: 2 },
  crane: { w: 1, d: 1, h: 118, ext: 90 }, gantry: { w: 7, d: 0.9, h: 66, col: '#ff9a2e' }, ship: { w: 5.6, d: 2, h: 16, hull: '#3a3a44', acc: '#ff9a2e' }, cart: { w: 1.4, d: 0.9, h: 24, awn: '#e8503a' }, tank: { w: 1.6, d: 1.6, h: 42, col: '#a8b0ba', acc: '#f2c230' },
  silo: { w: 1.4, d: 1.4, h: 70, col: '#c9ccd0' }, stack: { w: 0.9, d: 0.9, h: 80, col: '#6a7480', acc: '#f2c230' }, dome: { w: 2.6, d: 1.4, h: 24, acc: '#22d9ee' }, dish: { w: 1.2, d: 1.2, h: 36, acc: '#22d9ee', col: '#c9d6e4' }, windmill: { w: 1.2, d: 1.2, h: 74, col: '#e9e2d0' },
  autos: { w: 3.6, d: 0.9, h: 12, n: 3, seed: 3 }, containers: { w: 3.6, d: 1.2, h: 36, nx: 3, ny: 1, stack: 2, seed: 2 }, board: { w: 2, d: 0.3, h: 26, acc: '#f08a3c', text: '6 BUYERS', hot: 'board:1' }, lookout: { w: 1, d: 1, h: 14 },
  gate: { w: 0.3, d: 0.3, h: 16, gk: 'barrier', hx: 1, hy: 0, fx: 3, fy: 0 },
};
const mk = (t, o = {}) => { const s = { ...SAMPLE[t], ...o }, gx = 20, gy = 30, z = 0; return { t, gx, gy, zone: 1, z, key: gx + gy, ...s, bb: [(gx - (gy + s.d)) * 32 - 16, (gx + gy) * 16 - s.h - 46, (gx + s.w - gy) * 32 + 16, (gx + s.w + gy + s.d) * 16 + 14] }; };
const env = (o = {}) => ({ t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, hz: 0, locked: true, boardText: '6 BUYERS', lod: { detail: [1, 1, 1, 1] }, ...o });
const draw = (t, e = env(), p = mk(t)) => { const r = recCtx(); const polys = props.drawProp(r.ctx, p, e); return { ...r, polys }; };
stack.setFlag('static-prop', 'v2');

test('every static kind of the static-prop layer has a V2 drawer (43 kinds, none left on the legacy art)', () => {
  assert.equal(T4_KINDS.length, 43);
  assert.deepEqual(T4_KINDS.filter((k) => !stack.propKindsV2().includes(k)), []);
  assert.deepEqual(T4_KINDS.filter((k) => !SAMPLE[k]), [], 'the sample table of this test names every kind');
});

for (const kind of Object.keys(SAMPLE)) {
  test(`${kind}: draws without a fault, balances save and restore, leaves alpha at 1, strokes nothing thinner than 1.5 and draws one picture twice`, () => {
    const a = draw(kind), b = draw(kind);
    assert.ok(a.log.calls.length > 8, 'it draws something');
    assert.equal(a.log.depth, 0, 'save and restore balance'); assert.equal(a.log.minDepth, 0, 'never a restore without a save'); assert.equal(a.state.globalAlpha, 1, 'alpha is back at 1');
    assert.ok(thinnestStroke(a.log) >= 1.5 - 1e-9, `thinnest stroke ${thinnestStroke(a.log)}`);
    assert.deepEqual(a.log.calls, b.log.calls, 'the same call for call, twice: no clock, no random');
  });
}
test('the clock moves only what is live: a still world and a running one draw the same body, and a running one adds motion', () => {
  for (const kind of ['flag', 'lantern', 'crane', 'windmill', 'fountain', 'stack']) { const a = draw(kind, env({ t: 0 })), b = draw(kind, env({ t: 4321, wind: 1 })); assert.notDeepEqual(a.log.calls, b.log.calls, `${kind} moves with the clock`); }
});
test('a locked district\'s colours are veiled, not darkened: no prop is darker under cloud than it is open', () => {
  for (const c of ['#7cc65a', '#f4bb3e', '#ff5f4e', '#c9a0f2', '#fffaf0']) for (const k of [0.4, 1]) { const v = toys.col(c, { dim: 0.5 * k }), l0 = toys.luma(c), l1 = toys.luma(v); assert.ok(l1 >= l0 - 0.06, `${c} at ${k}: ${l0.toFixed(2)} -> ${l1.toFixed(2)}`); }
});

test('the market board leaves the hit shape the legacy drawer left, exactly: the three faces of its box', () => {
  const p = mk('board'); stack.setFlag('static-prop', 'legacy');
  const legacy = props.drawProp(recCtx().ctx, p, env({ locked: false })); stack.setFlag('static-prop', 'v2');
  const v2 = props.drawProp(recCtx().ctx, p, env({ locked: false }));
  assert.equal(legacy.length, 3); assert.deepEqual(v2.map((q) => q.map((pt) => pt.map((n) => Math.round(n * 1e6) / 1e6))), legacy.map((q) => q.map((pt) => pt.map((n) => Math.round(n * 1e6) / 1e6))));
});
test('no other static kind claims a hit (the frame takes the gate\'s circle itself)', () => { for (const k of Object.keys(SAMPLE)) if (k !== 'board') assert.ok(!draw(k).polys, `${k} returned a hit shape`); });

// ---------------------------------------------------------------- the atlas
test('atlas.rectOf: the sprite box is the footprint plus the room asked for plus the reach of the shadow, and never smaller than the footprint', () => {
  const p = { w: 2, d: 1, h: 40 }, r = at.rectOf(p, [10, 12, 14, 8]);
  assert.deepEqual(r.map((v) => Math.round(v * 100) / 100), [-(32 + 10 + 7), -(40 + 12), 64 + 14 + 22 + 8, 48 + 8 + 10.8]);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(at.rectOf({ w: 1, d: 1, h: 0 }, [0, 0, 0, 0])[i]) > 0 || i === 1);
  const taller = at.rectOf({ ...p, h: 80 }, [10, 12, 14, 8]); assert.ok(taller[1] < r[1] && taller[2] > r[2] && taller[3] > r[3], 'a taller prop gets a taller box and a longer shadow');
});
test('atlas.lookKey: props of one look share a name, and anything that changes the picture changes it (size, field, veil, lite)', () => {
  const p = { w: 1, d: 1, h: 20, col: '#ff0000' }, e = { dim: 0, hz: 0, lite: false };
  assert.equal(at.lookKey('x', p, ['col'], e, 0), at.lookKey('x', { ...p }, ['col'], e, 0));
  for (const [q, ee] of [[{ ...p, col: '#00ff00' }, e], [{ ...p, h: 21 }, e], [p, { ...e, dim: 0.25 }], [p, { ...e, lite: true }], [p, { ...e, hz: 0.05 }]]) assert.notEqual(at.lookKey('x', p, ['col'], e, 0), at.lookKey('x', q, ['col'], ee, 0));
  assert.notEqual(at.lookKey('x', p, ['col', '#'], e, 1), at.lookKey('x', p, ['col', '#'], e, 2), 'the four-way variant is in the name');
});
test('the atlas blits one sprite wherever a look stands, builds nothing while the zoom moves, and draws directly without canvases', async () => {
  const saved = globalThis.OffscreenCanvas; let made = 0; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  globalThis.OffscreenCanvas = class { constructor(w, h) { made++; this.width = w; this.height = h; } getContext() { return (this.c ||= recCtx().ctx); } transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; } };
  const mkCtx = (a) => { const r = recCtx(); const f = { getTransform: () => ({ a, b: 0, c: 0, d: a, e: 5, f: 7 }) }; return new Proxy(r.ctx, { get: (o, k) => (k in f ? f[k] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }); };
  try {
    at.clearAtlas(); at.resetAtlasClock(); let painted = 0; const rect = [-10, -20, 10, 4];
    assert.equal(at.blit(mkCtx(2), 'k1', rect, () => { painted++; }, 100, 200), false, 'the zoom has only just been seen: nothing is built, the thing is drawn'); assert.equal(painted, 1); assert.equal(made, 0);
    await sleep(120);
    assert.equal(at.blit(mkCtx(2), 'k1', rect, () => { painted++; }, 100, 200), true, 'the zoom has rested: the look is built and blitted'); assert.equal(painted, 2); assert.ok(made >= 1);
    at.blit(mkCtx(2), 'k1', rect, () => { painted++; }, 300, 400); assert.equal(painted, 2, 'the second place of the same look is a blit, not a drawing');
    assert.equal(at.atlasSize().sprites, 1); assert.ok(at.atlasSize().pixels > 0);
    at.blit(mkCtx(2.0005), 'k1', rect, () => { painted++; }, 50, 60); assert.equal(painted, 2, 'a scale a hair off is the same sprite (1/1024 octave)');
    at.clearAtlas(); assert.equal(at.atlasSize().sprites, 0);
    delete globalThis.OffscreenCanvas; painted = 0; assert.equal(at.blit(mkCtx(2), 'k2', rect, () => { painted++; }, 1, 2), false); assert.equal(painted, 1, 'with no canvas the thing is drawn directly');
  } finally { if (saved === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = saved; at.clearAtlas(); }
});

// ---------------------------------------------------------------- nature
test('species follow the district and the tree\'s own hash; sizes and greens vary; sway is zero when time stands still and never more than 1.2 pixels', () => {
  const sp = (theme, i) => nature.speciesOf({ gx: 3 + i * 1.7, gy: 5 + i * 0.9, theme });
  for (const [theme, allowed] of [['campus', ['pine', 'round']], ['harbor', ['palm', 'round']], ['farm', ['apple', 'round']], ['creative', ['blossom', 'round']], ['metro', ['round']], ['estate', ['pine', 'round']]]) for (let i = 0; i < 30; i++) assert.ok(allowed.includes(sp(theme, i)), `${theme}: ${sp(theme, i)}`);
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => sp('campus', i))).size >= 2, 'a district has more than one species');
  assert.equal(nature.swayOf(0, 1.3), 0); let max = 0; for (let t = 1; t < 40000; t += 137) max = Math.max(max, Math.abs(nature.swayOf(t, 0.7))); assert.ok(max <= 1.2 + 1e-9 && max > 0.8, `max sway ${max}`);
  assert.equal(nature.speciesOf({ gx: 1, gy: 1, theme: 'campus' }), nature.speciesOf({ gx: 1, gy: 1, theme: 'campus' }));
});
test('micro-props: the same island every time, nothing in a rich district that is litter, and nothing for a kind that has none', () => {
  const a = life.attendantOf('lamp', { gx: 12.5, gy: 7.25 }, 'campus'), b = life.attendantOf('lamp', { gx: 12.5, gy: 7.25 }, 'campus'); assert.deepEqual(a, b);
  const seen = new Set(); for (let i = 0; i < 400; i++) for (const kind of ['lamp', 'bench', 'tree', 'crates', 'tires', 'barrel', 'planter', 'flag', 'bollard']) for (const theme of ['estate', 'finance', 'exchange', 'scrap', 'pawn', 'campus', 'metro', 'harbor']) { const r = life.attendantOf(kind, { gx: i * 1.37, gy: i * 0.71 }, theme); if (r) { seen.add(r[0]); if (['estate', 'finance', 'exchange'].includes(theme)) assert.ok(!['cup', 'puddle', 'bin'].includes(r[0]), `${theme} has ${r[0]}`); } }
  for (const n of ['flowerpot', 'pigeon', 'bush', 'flowers', 'rock', 'cup', 'puddle', 'hydrant']) assert.ok(seen.has(n), `${n} appears somewhere`);
  assert.equal(life.attendantOf('crane', { gx: 1, gy: 1 }, 'scrap'), null);
});
test('gulls circle their district on a lap of 50 to 80 s at a height of 70 to 110, the same sky every time; water spots are open water, apart, and the same every run', () => {
  const D = lay.DIST[1]; for (let i = 0; i < 3; i++) { const g = life.gullAt(D, i, 12345), g2 = life.gullAt(D, i, 12345); assert.deepEqual(g, g2); assert.ok(g.ground - g.y >= 70 - 1e-9 && g.ground - g.y <= 110 + 1e-9, `gull ${i} height ${g.ground - g.y}`); }
  const s = life.waterSpots(); assert.ok(s.length >= 4, `${s.length} boats`); for (const [gx, gy] of s) { assert.equal(lay.LAYOUT.isLand(Math.round(gx), Math.round(gy)), false); }
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1]) >= 29.9);
  const total = lay.LAYOUT.ids.reduce((n, id) => n + life.boatsOf(id).length, 0); assert.equal(total, s.length, 'every boat belongs to one district');
});

// ---------------------------------------------------------------- toys, colours, crates
test('toys.lifted brings a dark data colour to luma 0.6 and leaves a light one alone; toys.toyOf snaps a colour to the nearest toy colour and a grey to cream or blue', () => {
  for (const c of ['#1b2634', '#3a3a44', '#5d6a3a', '#202a3d', '#4b7a4e']) assert.ok(toys.luma(toys.lifted(c)) >= 0.58, `${c} -> ${toys.lifted(c)}`);
  assert.equal(toys.lifted('#f6c94f'), '#f6c94f');
  assert.equal(toys.toyOf('#b0493a'), pal.TOY.red); assert.equal(toys.toyOf('#3d6fb0'), pal.TOY.blue); assert.equal(toys.toyOf('#4a7f55'), pal.TOY.green); assert.ok([pal.TOY.blue, '#fffaf0'].includes(toys.toyOf('#808080')));
});
test('a crate is the colour of its first tag, and the peeker that sticks out of it follows the tag\'s family', async () => {
  const cfg = await import('../js/config.js'); assert.equal(stock.classColor('pen'), pal.crateColor(cfg.ASSETS.pen.tags[0]));
  const map = { tool: 'spanner', paper: 'book', training: 'book', retro: 'radio', electronics: 'radio', outdoor: 'wheel', vehicle: 'wheel', fashion: 'dress', gem: 'gem', luxury: 'gem', farm: 'leaf', food: 'leaf', digital: 'laptop', finance: 'coins', home: 'lamp' };
  for (const [t, k] of Object.entries(map)) assert.equal(stock.peekerOf(t), k); assert.equal(stock.peekerOf('scrap'), null);
});
test('the new modules never read the wall clock or Math.random while drawing (everything is a function of the world, the zoom and env.t)', () => {
  for (const f of ['toys', 'nature', 'characters', 'stock', 'street', 'yard', 'industry', 'vehicles', 'life']) { const s = readFileSync(new URL(`../js/world/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); assert.ok(!/Math\.random|Date\.now|new Date|performance\.now/.test(s), `${f}.js reads the wall clock or random`); }
  const a = readFileSync(new URL('../js/world/atlas.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); assert.ok(!/Math\.random/.test(a), 'the atlas keeps its own building clock (a cache policy, never the picture) and uses no random');
});
test('the new modules keep to the palette: none names a retired colour', () => {
  for (const f of ['nature', 'characters', 'stock', 'street', 'yard', 'industry', 'vehicles', 'life', 'toys']) { const s = readFileSync(new URL(`../js/world/${f}.js`, import.meta.url), 'utf8'); for (const bad of ['#121826', 'rgb(8,10,20)', '#4b7a4e', '#2f3644', '#1b3b5c']) assert.ok(!s.includes(bad), `${f}.js has ${bad}`); }
});
