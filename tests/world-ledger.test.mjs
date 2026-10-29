// The pixel ledger, the releasers and the time-slicer (js/world/gfx.js), the chunk arithmetic (js/world/chunks.js) and the memory plan of docs/RENDER_PLAN.md section 6, summed:
// the holders of the render-memory block at dsf 2 must come to under 160 MB at every zoom, with the headroom the plan promises. All pure: no canvas is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledger, LEDGER_LIMIT_MB, registerReleaser, releaseAll, slice } from '../js/world/gfx.js';
import { CHUNK_PX, chunkWorld, chunkBytes, chunksTouched, groundBytes, chunksFor } from '../js/world/chunks.js';
import { SPRITE_BUDGET } from '../js/world/sprites.js';

const DOC = readFileSync(new URL('../docs/RENDER_PLAN.md', import.meta.url), 'utf8');
const MEM = JSON.parse(DOC.match(/<!-- render-memory -->\s*```json\n([\s\S]*?)\n```/)[1]);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);

// ---------------------------------------------------------------------------------------------------------------------------- the ledger
test('the ledger: holders register what they hold under a name of their own, replace it, give it back, and the total is the sum', () => {
  ledger.clear(); assert.equal(ledger.total(), 0); assert.ok(ledger.within());
  assert.equal(ledger.register('ground.chunks', ledger.bytesOf(384, 384)), 589824); assert.equal(ledger.register('sprites', 48e6), 48e6);
  assert.equal(ledger.total(), 48e6 + 589824); assert.equal(ledger.total('sprites'), 48e6); assert.equal(ledger.total('nobody'), 0);
  ledger.register('sprites', 50e6); assert.equal(ledger.total('sprites'), 50e6, 'a name registered again replaces, never adds');
  assert.deepEqual(ledger.entries().map((e) => e[0]), ['sprites', 'ground.chunks'], 'largest first');
  assert.equal(ledger.release('sprites'), true); assert.equal(ledger.release('sprites'), false); assert.equal(ledger.total(), 589824);
  assert.equal(ledger.register('ground.chunks', 0), 0); assert.equal(ledger.total(), 0, 'registering nothing gives it back');
  assert.equal(ledger.register('x', -5), 0); assert.equal(ledger.register('x', NaN), 0); assert.equal(ledger.register('x', 3.6), 4, 'a holder\'s bytes are whole');
  assert.throws(() => ledger.register('', 1), /name/); assert.throws(() => ledger.register(3, 1), /name/);
  ledger.register('big', 161e6); assert.equal(ledger.within(), false); assert.equal(ledger.within(200), true); assert.equal(LEDGER_LIMIT_MB, 160); assert.equal(ledger.bytesOf(2880, 1800), 20736000); assert.equal(ledger.bytesOf(-1, 5), 0);
  ledger.clear();
});

test('releasers: every registered function is called by releaseAll, in turn, and one that throws does not strand the rest', () => {
  const held = releaseAll(); // (the modules that hold bitmaps register their own releaser when they load: sprites.js does, so the count is theirs plus ours)
  const calls = []; const off1 = registerReleaser(() => calls.push('a')); registerReleaser(() => { throw new Error('a holder that cannot let go'); }); const off3 = registerReleaser(() => calls.push('c'));
  assert.equal(releaseAll(), held + 2, 'two of ours ran; the one that threw is not counted'); assert.deepEqual(calls, ['a', 'c']);
  off1(); off3(); calls.length = 0; assert.equal(releaseAll(), held, 'the throwing one is still registered and still throws, quietly'); assert.deepEqual(calls, []);
  assert.throws(() => registerReleaser('no'), /function/);
});

test('slice: a long job runs in slices of at most `ms`, yields between them, finishes, can be cancelled, and reports a throw', async () => {
  let clock = 0; const queue = [], later = (fn) => queue.push(fn), now = () => clock, pump = () => { let n = 0; while (queue.length) { queue.shift()(); n++; } return n; };
  const steps = []; function* job() { for (let i = 0; i < 10; i++) { clock += 1; steps.push(i); yield; } }
  const s = slice(job, { ms: 4, now, later }); assert.equal(steps.length, 0, 'nothing runs before the first idle moment');
  queue.shift()(); assert.deepEqual(steps, [0, 1, 2, 3], 'the first slice ran four steps of 1 ms'); assert.equal(queue.length, 1, 'and asked to go on');
  assert.equal(pump(), 2); assert.equal(steps.length, 10); assert.equal(await s.done, true);
  const c = []; function* long() { for (let i = 0; i < 100; i++) { clock += 1; c.push(i); yield; } }
  const k = slice(long(), { ms: 5, now, later }); queue.shift()(); assert.equal(c.length, 5); k.cancel(); queue.shift()(); assert.equal(c.length, 5, 'cancelled: no further step'); assert.equal(await k.done, false);
  function* bad() { yield; throw new Error('a build that fails'); } const b = slice(bad, { ms: 50, now, later }); queue.shift()(); await assert.rejects(b.done, /a build that fails/);
  function* one() { yield; } const o = slice(one, { ms: 1000, now, later }); queue.shift()(); assert.equal(await o.done, true, 'a job that ends inside its first slice finishes in it'); assert.equal(queue.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------------- chunks
test('chunks are a fixed number of DEVICE pixels, so the ground holds the same memory at every zoom and density', () => {
  assert.equal(CHUNK_PX, 384); assert.equal(chunkBytes(), 384 * 384 * 4);
  near(chunkWorld(0.9, 2), 384 / 1.8); near(chunkWorld(2.4, 2), 80); near(chunkWorld(1, 1), 384);
  assert.equal(chunksTouched(1440, 900, 2), (Math.ceil(2880 / 384) + 1) * (Math.ceil(1800 / 384) + 1)); assert.equal(chunksTouched(1440, 900, 2), 54);
  const g = groundBytes(1440, 900, 2); assert.equal(g.rest, 54 * 589824); assert.equal(g.peak, Math.round(54 * 589824 * 1.25));
  for (const z of [0.129, 0.5, 0.9, 1.2, 2.4]) { const v = { x0: 0, x1: 1440 / z, y0: 0, y1: 900 / z }, c = chunksFor(v, z, 2); assert.ok((c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1) <= 54, `${z}: ${(c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1)} chunks`); assert.ok(c.i0 * c.s <= v.x0 && (c.i1 + 1) * c.s >= v.x1 && c.j0 * c.s <= v.y0 && (c.j1 + 1) * c.s >= v.y1, 'the chunks cover the view'); near(c.bleed, 1 / (z * 2)); }
  const bleed = chunksFor({ x0: 0, x1: 100, y0: 0, y1: 100 }, 1, 2); assert.ok(bleed.i0 <= -1 || bleed.i0 === 0, 'a view on a chunk edge reaches into the next chunk by the bleed'); assert.equal(chunksFor({ x0: -1, x1: 1, y0: 5, y1: 6 }, 1, 2).i0, -1);
});

// ---------------------------------------------------------------------------------------------------------------------------- the plan's memory table, summed
const mbOf = (h) => {
  if (typeof h.mb === 'number') return h.mb;
  const [w, hh] = MEM.window, d = MEM.dsf;
  if (h.mb === 'canvas') return (w * d * hh * d * 4) / 1e6;
  if (h.mb === 'ground.peak') return groundBytes(w, hh, d).peak / 1e6;
  if (h.mb === 'sprites') return (MEM.spritePixelsAtDsf2 * 4) / 1e6;
  throw new Error('unknown holder ' + h.mb);
};
test('the memory plan: the holders of the render-memory block come to under the ceiling at dsf 2, with the headroom the plan says it keeps', () => {
  const rows = MEM.holders.map((h) => [h.id, mbOf(h)]), total = rows.reduce((s, [, v]) => s + v, 0);
  assert.equal(MEM.limitMb, LEDGER_LIMIT_MB); assert.ok(total <= MEM.limitMb - MEM.headroomMb, `${total.toFixed(1)} MB of ${MEM.limitMb} (headroom ${MEM.headroomMb}): ${rows.map(([n, v]) => n + ' ' + v.toFixed(1)).join(', ')}`);
  assert.ok(total > 120, 'and the table is not empty of the big holders'); assert.equal(new Set(MEM.holders.map((h) => h.id)).size, MEM.holders.length);
  for (const h of MEM.holders) assert.match(h.owner, /^T[1-5]$/, h.id);
});
test('the plan\'s memory does not depend on the zoom: the ground is chunks of device pixels, where chunks of 1,024 WORLD pixels would be 387 MB at the finest zoom', () => {
  const [w, h] = MEM.window, d = MEM.dsf, peak = groundBytes(w, h, d).peak;
  for (const z of [0.9, 1.2, 2.4]) { const c = chunksFor({ x0: 123.4, x1: 123.4 + w / z, y0: 77.7, y1: 77.7 + h / z }, z, d), n = (c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1); assert.ok(n * chunkBytes() * 1.25 <= peak, `zoom ${z}: ${n} chunks`); }
  const worldChunks = (z) => { const side = 1024 * z * d, n = (Math.ceil(w / z / 1024) + 1) * (Math.ceil(h / z / 1024) + 1); return (n * side * side * 4) / 1e6; }; // the rule the plan used to state
  assert.ok(worldChunks(2.4) > 380, `${worldChunks(2.4).toFixed(0)} MB at 2.4`); assert.ok(worldChunks(1.2) > 140); assert.ok(worldChunks(0.9) > 80);
  assert.ok(groundBytes(w, h, d).peak / 1e6 < 45, 'against under 45 MB for the device-pixel rule');
});
test('the sprite row is reachable: the density-1 budget grown by the cache\'s own 1.5 at dsf 2 is the plan\'s 12 million pixels, and the budget today is what the block says it is', () => {
  assert.equal(Math.round(MEM.spriteBudgetBase * Math.max(1, Math.min(1.5, 1 + (MEM.dsf - 1) * 0.7))), MEM.spritePixelsAtDsf2, 'the density-1 budget times setSpriteBudget\'s growth at dsf 2');
  assert.equal(SPRITE_BUDGET, MEM.spriteBudgetNow, 'sprites.js still says 22 million at density 1 (T5 lowers it to spriteBudgetBase and changes this line of the plan in the same commit)');
});
