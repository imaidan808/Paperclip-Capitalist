// Soft shadows (js/world/shadow.js): the one cast-shadow rule and the stamps that draw it, against a recording canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { shadowLength, shadowReach, EDGE_WPX, ALPHA, stampSoft, contactShadow, castShadow, softStamps, releaseShadows } from '../js/world/shadow.js';
import { P } from '../js/world/iso.js';
import { LIGHT } from '../js/world/palette.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);

test('the shadow\'s length: 0.75 of the height by day, 1.2 at the golden hour, 0.5 by moonlight, and it reaches that many tiles', () => {
  near(shadowLength(0, 0), 0.75); near(shadowLength(1, 0), 0.5); near(shadowLength(0, 1), 1.2); near(shadowLength(0.5, 0), 0.625); assert.ok(shadowLength(0.4, 0.8) > 0.75 && shadowLength(0.4, 0.8) <= 1.2);
  near(shadowReach(40, 0, 0), (0.75 * 40) / EDGE_WPX); assert.ok(shadowReach(80, 0, 0) > shadowReach(40, 0, 0)); near(shadowReach(0, 0, 0), 0);
  assert.equal(shadowLength(-1, -1), 0.75, 'out-of-range light is clamped');
});

test('a cast shadow is two quads of the shadow violet towards +gx: a penumbra 0.2 tile wider and a core, under the caller\'s alpha, and never black', () => {
  const { ctx, log, state } = recCtx(); state.globalAlpha = 0.8;
  castShadow(ctx, 5, 5, 2, 1, 36, { night: 0, dusk: 0 });
  const quads = log.calls.filter((c) => c[0] === 'fill'); assert.equal(quads.length, 2); assert.deepEqual(log.fills.map((f) => f.style), [LIGHT.shadow, LIGHT.shadow]);
  near(log.fills[0].alpha, 0.8 * ALPHA.penumbra); near(log.fills[1].alpha, 0.8 * ALPHA.core); near(state.globalAlpha, 0.8);
  const moves = log.calls.filter((c) => c[0] === 'moveTo'), lines = log.calls.filter((c) => c[0] === 'lineTo');
  const xs = (m, l) => [m[1], ...l.map((c) => c[1])]; const pen = xs(moves[0], lines.slice(0, 3)), core = xs(moves[1], lines.slice(3, 6));
  assert.ok(Math.max(...pen) > Math.max(...core) && Math.min(...pen) < Math.min(...core), 'the penumbra is wider than the core');
  assert.equal(Math.max(...core), P(5 + 2 + shadowReach(36, 0, 0), 5).at(0) > Math.max(...core) - 1e-6 ? Math.max(...core) : -1);
  const long = recCtx(); castShadow(long.ctx, 5, 5, 2, 1, 36, { night: 0, dusk: 1 }); const lx = long.log.calls.filter((c) => c[0] === 'lineTo').map((c) => c[1]);
  assert.ok(Math.max(...lx) > Math.max(...core), 'a golden-hour shadow is longer');
  const free = recCtx(); castShadow(free.ctx, 1, 1, 1, 1, 10); assert.equal(free.log.fills.length, 2, 'no light given: plain day');
});

test('soft stamps: where there is no OffscreenCanvas they are two flat ellipses in the shadow violet; contact patches are a narrow dark and a wide pale ellipse pushed away from the sun', () => {
  releaseShadows(); assert.equal(softStamps(), false, 'the Node tests have no OffscreenCanvas');
  const { ctx, log } = recCtx(); stampSoft(ctx, 10, 20, 8, 4, 0.3);
  assert.ok(log.fills.length >= 2); for (const f of log.fills) assert.match(String(f.style), /^rgba\(74,63,136,/);
  const t = recCtx(); stampSoft(t.ctx, 0, 0, 0.1, 0.1, 0.3); const e = t.log.calls.find((c) => c[0] === 'ellipse'); assert.ok(e[3] >= 1.5 && e[4] >= 1.5, 'a stamp is never a hairline');
  const c = recCtx(); contactShadow(c.ctx, 100, 100, 10, 5);
  const els = c.log.calls.filter((k) => k[0] === 'ellipse'); assert.ok(els.length >= 4); for (const k of els) { assert.ok(k[1] > 100 && k[2] > 100, 'pushed down and to the right, away from the upper-left sun'); }
  for (const f of c.log.fills) assert.match(String(f.style), /^rgba\(59,51,116,/); // the contact colour, not ink
  assert.equal(c.log.depth, 0);
});
