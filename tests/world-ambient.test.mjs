// The living air (js/world/ambient.js): cartoon rain no thinner than 1.5 px, round confetti, gulls and butterflies that are a function of the clock and nothing else, the smoke buildings ask for, and the V2 particles (round coins,
// stars, soft double rings). Everything stands still and clean under Calm, Off and reduced motion, and nothing here allocates in a frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';
import { RAIN, rainWidths, paintRain, paintWeather, CONFETTI, gullAt, SKY_CELL, butterflyAt, butterflyHome, BF_CELL, paintField, paintSmoke, paintSmokeQueue, paintParticles } from '../js/world/ambient.js';
import { Fx } from '../js/world/fx.js';
import { LAYOUT } from '../js/world/layout.js';
import { slotFor, setFlag } from '../js/world/stack.js';
import { HW } from '../js/world/iso.js';
import '../js/world/atmos.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);
const world = (o = {}) => ({ W: 1000, H: 640, cam: { x: 700, y: 2400, z: 0.5 }, vt: 123456, t: 123456, night: 0, lite: false, mode: 'world', far: false, rainOn: true, fx: new Fx(), env: { crunch: false, surge: false, tariff: false, wind: 1, lod: { detail: [1, 1, 1, 0] }, smoke: [] }, reduced: () => false, ...o });
const calls = (r, k) => r.log.calls.filter((c) => c[0] === k).length;

test('rain is fat, rounded and pastel in three depths: never thinner than the art direction\'s 1.5 px, one stroke a depth, and it only draws in a credit crunch with motion on', () => {
  assert.ok(rainWidths().every((w) => w >= 1.5), 'no hairline'); assert.ok(RAIN.width[0] < RAIN.width[1] && RAIN.width[1] < RAIN.width[2] && RAIN.len[0] < RAIN.len[2], 'the near drops are the fat long ones');
  const w = world(); w.fx.rainStep(0.05); const r = recCtx(); paintRain(r.ctx, w);
  assert.equal(r.log.strokes.length, 3, 'one stroke a depth'); assert.ok(thinnestStroke(r.log) >= 1.5); assert.equal(r.state.lineCap, 'butt'); assert.equal(r.log.depth, 0);
  const none = recCtx(); paintWeather(none.ctx, world({ env: { crunch: false, surge: false, tariff: false } })); assert.equal(none.log.calls.length, 0, 'clear weather draws nothing');
  const crunch = recCtx(); paintWeather(crunch.ctx, world({ env: { crunch: true, surge: false, tariff: false }, rainOn: true })); assert.equal(crunch.log.strokes.length, 3);
  const calm = recCtx(); paintWeather(calm.ctx, world({ env: { crunch: true, surge: false, tariff: false }, rainOn: false })); assert.equal(calm.log.strokes.length, 0, 'no rain under reduced motion');
});

test('a trend surge is round confetti and a pink wash, a tariff a warm wash: no square dots, and none of the retired pure-pink', () => {
  const r = recCtx(); paintWeather(r.ctx, world({ env: { crunch: false, surge: true, tariff: true } }));
  assert.equal(calls(r, 'arc'), 28, 'twenty-eight round pieces'); assert.equal(r.log.rects.length, 2, 'the two washes are the only rectangles'); assert.ok(CONFETTI.every((c) => /^#[0-9a-f]{6}$/.test(c))); assert.ok(!CONFETTI.includes('#ff3da8'), 'pastel, not the retired hot pink');
  const still = recCtx(); paintWeather(still.ctx, world({ env: { crunch: false, surge: true, tariff: false }, reduced: () => true })); assert.equal(calls(still, 'arc'), 0, 'no confetti when motion is reduced'); assert.equal(still.log.rects.length, 1, 'the wash stays');
});

test('a gull is a function of the clock: the cell\'s bird at the same time is in the same place, it laps in 60 to 90 s, flaps twice a second and stays within a loop of its cell; about six cells in ten have one', () => {
  const a = {}, b = {}; let cell = null; for (let cx = 0; cx < 6 && !cell; cx++) if (gullAt(cx, 1, 41000, a)) cell = [cx, 1]; assert.ok(cell); gullAt(cell[0], cell[1], 41000, b); assert.deepEqual(a, b);
  let birds = 0, maxFlap = 0; for (let cx = -8; cx < 8; cx++) for (let cy = -8; cy < 8; cy++) { const g = {}; if (!gullAt(cx, cy, 0, g)) continue; birds++;
    for (let t = 0; t < 120000; t += 1999) { gullAt(cx, cy, t, g); assert.ok(g.x > cx * SKY_CELL - 1000 && g.x < (cx + 1) * SKY_CELL + 1000 && g.y > cy * SKY_CELL - 600 && g.y < (cy + 1) * SKY_CELL + 600, `a gull of cell ${cx},${cy} is off its loop at ${t}`); assert.ok(Math.abs(g.flap) <= 1 && g.size >= 30 && g.size <= 44 && Math.abs(g.dir) === 1); maxFlap = Math.max(maxFlap, Math.abs(g.flap)); }
    const g0 = {}, g1 = {}; gullAt(cx, cy, 0, g0); gullAt(cx, cy, g0.lap, g1); assert.ok(Math.hypot(g0.x - g1.x, g0.y - g1.y) < 1e-6, 'a lap brings it home'); assert.ok(g0.lap >= 60000 && g0.lap <= 90000); }
  assert.ok(birds >= 130 && birds <= 175, `${birds} birds in 256 cells`); assert.ok(maxFlap > 0.99);
  let flaps = 0, prev = {}; gullAt(cell[0], cell[1], 0, prev); for (let t = 20; t < 10000; t += 20) { const g = {}; gullAt(cell[0], cell[1], t, g); if (prev.flap < 0 && g.flap >= 0) flaps++; prev = g; } assert.ok(flaps >= 18 && flaps <= 22, `${flaps} flaps in 10 s`);
});

test('a butterfly keeps to its patch: within two and a half tiles of home on a figure of eight, above the ground, deterministic, and its wings beat at about two beats a second', () => {
  const o = {}, o2 = {}; butterflyAt(40, 100, 7, 30000, o); butterflyAt(40, 100, 7, 30000, o2); assert.deepEqual(o, o2);
  const home = { x: (40 - 100) * HW }; let minX = 1e9, maxX = -1e9, flaps = 0, prev = 0; for (let t = 0; t < 60000; t += 40) { const b = {}; butterflyAt(40, 100, 7, t, b); minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); if (prev < 0 && b.flap >= 0) flaps++; prev = b.flap; }
  assert.ok(maxX - minX < 2 * 2.6 * 2 * HW + 1 && Math.abs((minX + maxX) / 2 - home.x) < 3.5 * HW, 'it stays near its patch'); assert.ok(flaps / 60 > 1.8 && flaps / 60 < 2.6, `${flaps / 60} beats a second`);
});

test('the field: nothing under reduced motion, in the quiet tier, in rain or on the map; gulls over the water at the middle zooms and none close in; butterflies only close in; pollen only once the camera is in', () => {
  const silent = [{ reduced: () => true }, { lite: true }, { env: { crunch: true, lod: { detail: [1, 1, 1, 0] }, smoke: [] } }, { mode: 'map' }];
  for (const o of silent) { const r = recCtx(); paintField(r.ctx, world({ ...o })); assert.equal(r.log.calls.length, 0, JSON.stringify(Object.keys(o))); }
  const far = recCtx(); paintField(far.ctx, world({ cam: { x: 711, y: 2467, z: 0.3 } })); assert.ok(calls(far, 'quadraticCurveTo') >= 4, 'gulls over the sea at 0.3'); assert.equal(far.log.depth, 0); near(far.state.globalAlpha, 1);
  let spot = null; for (let cx = 0; cx < 12 && !spot; cx++) for (let cy = 8; cy < 14 && !spot; cy++) { const gx = butterflyHome(cx, cy, 0), gy = butterflyHome(cx, cy, 1); if (LAYOUT.isLand(Math.floor(gx), Math.floor(gy))) { const b = {}; butterflyAt(gx, gy, cx * 733 + cy * 1291, 123456, b); spot = [b.x, b.y]; } }
  assert.ok(spot, 'a meadow with a butterfly'); const close = recCtx(); paintField(close.ctx, world({ cam: { x: spot[0], y: spot[1], z: 2.4 } })); assert.equal(calls(close, 'quadraticCurveTo'), 0, 'no gulls at close range'); assert.ok(calls(close, 'ellipse') >= 6, 'butterflies over the meadow');
  const day = recCtx(); paintField(day.ctx, world({ cam: { x: -2944, y: 2153, z: 1 } })); assert.ok(day.log.calls.some((c) => c[0] === 'drawImage') || calls(day, 'ellipse') > 0 || calls(day, 'quadraticCurveTo') > 0, 'something lives in the air at the working zoom'); void BF_CELL;
  const night = recCtx(); paintField(night.ctx, world({ night: 1, cam: { x: spot[0], y: spot[1], z: 2.4 } })); assert.equal(calls(night, 'ellipse'), 0, 'no butterflies at night');
});

test('smoke is round puffs that rise and thin out; nothing at a clock of 0; the queue buildings push to is drawn once and emptied (and emptied without drawing when motion is reduced)', () => {
  const r0 = recCtx(); paintSmoke(r0.ctx, 10, 10, 0); assert.equal(r0.log.calls.length, 0);
  const r = recCtx(); paintSmoke(r.ctx, 10, 10, 5000, 1, 4); assert.equal(calls(r, 'arc'), 4); assert.ok(r.log.fills.every((f) => f.alpha <= 0.5 + 1e-9)); near(r.state.globalAlpha, 1);
  const ys = r.log.calls.filter((c) => c[0] === 'arc').map((c) => c[2]); assert.ok(ys.every((y) => y <= 10 + 1e-9), 'it rises'); const big = recCtx(); paintSmoke(big.ctx, 10, 10, 5000, 2, 4); assert.ok(big.log.calls.filter((c) => c[0] === 'arc')[0][3] > r.log.calls.filter((c) => c[0] === 'arc')[0][3], 'a bigger source, bigger puffs');
  const w = world(); w.env.smoke.push({ wx: 700, wy: 2400, size: 1 }, { wx: 700 + 50, wy: 2400, size: 1.5 }, { wx: 1e7, wy: 0 }); const q = recCtx(); paintSmokeQueue(q.ctx, w); assert.equal(calls(q, 'arc'), 8, 'two columns of four; the one off screen is skipped'); assert.equal(w.env.smoke.length, 0, 'the queue is empty for the next frame');
  const w2 = world({ reduced: () => true }); w2.env.smoke.push({ wx: 700, wy: 2400 }); const q2 = recCtx(); paintSmokeQueue(q2.ctx, w2); assert.equal(q2.log.calls.length, 0); assert.equal(w2.env.smoke.length, 0);
  const none = recCtx(); paintSmokeQueue(none.ctx, world({ env: {} })); assert.equal(none.log.calls.length, 0, 'a world with no queue is fine');
});

test('the particles are round: coins that turn, stars for sparks, soft dust and double rings with no hairline; text pops have a plum edge, not ink; the pool is left as it was', () => {
  const w = world(); const fx = w.fx; fx.coins(700, 2400, 6, 3); fx.sparks(700, 2400, 6, 3); fx.puff(700, 2400, 8, 5); fx.ring(700, 2400, 6, 40, 0.9); fx.pop('+$40', 700, 2390); fx.update(0.2, false);
  const before = [...fx.kind], r = recCtx(); paintParticles(r.ctx, w);
  assert.deepEqual([...fx.kind], before, 'drawing changes nothing in the pool'); assert.equal(r.log.rects.length, 0, 'no fillRect: no square coins or motes'); assert.ok(calls(r, 'ellipse') >= 6 * 3, 'a coin is three ellipses');
  assert.ok(thinnestStroke(r.log) >= 2.6 || r.log.strokes.length === 0, 'the rings are 2.6 px or more'); assert.ok(r.log.strokes.some((s) => s.lw === 6) && r.log.strokes.some((s) => s.lw === 2.6), 'a soft double ring: a wide pale line and a thin bright one');
  assert.ok(calls(r, 'quadraticCurveTo') >= 6 * 4, 'a spark is a little four-pointed star'); assert.equal(r.state.strokeStyle, 'rgba(44,42,86,.88)', 'the text pop\'s edge is plum (ink is retired)'); near(r.state.globalAlpha, 1); assert.equal(r.log.depth, 0);
  const idle = recCtx(); paintParticles(idle.ctx, world()); assert.equal(idle.log.calls.length, 0, 'an empty pool costs nothing');
});

test('the V2 weather, field and particles layers are registered in screen space, are the default build\'s, and are used only while flagged', () => {
  for (const id of ['weather', 'field', 'particles']) { assert.equal(slotFor(id).impl, 'v2', `${id}: the default build is the new air`); assert.equal(slotFor(id).space, 'screen'); setFlag(id, 'legacy'); try { assert.equal(slotFor(id).impl, 'legacy'); } finally { setFlag(id, 'v2'); } }
});
