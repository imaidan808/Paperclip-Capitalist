// The layer stack (js/world/stack.js): the table of layers, the flags that choose a legacy or a V2 drawer, and the runner. The default build runs every legacy drawer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, FLAGS, IMPLS, registerLayer, setFlag, setFlags, slotFor, layerInfo, runLayer } from '../js/world/stack.js';
import { World } from '../js/world/world.js';

/** A stand-in world: it records the method each legacy adapter calls and the spaces the runner sets. */
function fakeWorld() {
  const calls = [], w = { env: { tag: 'env' }, calls };
  w.toScreen = () => calls.push('toScreen'); w.toWorld = () => calls.push('toWorld');
  return new Proxy(w, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push([String(k), ...a]); }) });
}
const reset = () => { for (const L of LAYERS) setFlag(L.id, 'legacy'); };

test('the table: every layer has a unique id, an owner T1 to T5, a space and a stage; and the build starts with every flag on legacy', () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const L of LAYERS) {
    assert.match(L.owner, /^T[1-5]$/, L.id); assert.ok(['screen', 'world', 'inherit'].includes(L.space), L.id); assert.ok(['sea', 'ground', 'things', 'air', 'screen'].includes(L.stage), L.id); assert.equal(typeof L.legacy, 'function');
    assert.equal(FLAGS[L.id], 'legacy', `${L.id} must start as legacy`); assert.equal(slotFor(L.id).impl, 'legacy'); assert.equal(layerInfo(L.id), L);
  }
  assert.deepEqual([...IMPLS], ['legacy', 'v2']);
});

test('every legacy adapter calls a method the World really has, with the arguments that method takes', () => {
  const w = fakeWorld(), ctx = {}, view = {};
  for (const L of LAYERS) {
    w.calls.length = 0; L.legacy(ctx, view, w.env, w, { far: true, see: () => true, zoom: 1, mode: 0 });
    const [name] = w.calls[0]; assert.equal(typeof World.prototype[name], 'function', `${L.id} calls ${name}, which the World lacks`);
    assert.equal(w.calls[0][1], ctx, `${L.id} passes the context first`);
  }
});

test('runLayer sets the space a layer wants, hands it (ctx, view, env, w, a), and does nothing for an id that is not a layer', () => {
  reset(); const w = fakeWorld(), ctx = { id: 'ctx' }, view = { id: 'view' };
  runLayer('grade', w, ctx, view); assert.deepEqual(w.calls.slice(0, 2), ['toScreen', ['drawGrade', ctx]]);
  w.calls.length = 0; runLayer('clouds', w, ctx, view, 'vz'); assert.deepEqual(w.calls, ['toWorld', ['drawFog', ctx, 'vz']]);
  w.calls.length = 0; runLayer('lead', w, ctx, view, { id: 'lead:1' }); assert.equal(w.calls.includes('toWorld') || w.calls.includes('toScreen'), false, 'an item layer inherits the caller\'s space');
  w.calls.length = 0; runLayer('nothing-like-this', w, ctx, view); runLayer('constructor', w, ctx, view); runLayer('__proto__', w, ctx, view); assert.deepEqual(w.calls, []);
});

test('a V2 drawer is used only while its flag says v2, with the space it asked for; flipping back restores the legacy drawer', () => {
  reset(); const w = fakeWorld(), seen = [];
  assert.throws(() => registerLayer('nope', () => {}), /no layer/); assert.throws(() => registerLayer('sea', 'not a function'), /function/); assert.throws(() => registerLayer('sea', () => {}, 'sideways'), /space/);
  registerLayer('sea', (ctx, view, env, ww, a) => seen.push(['v2 sea', env.tag, a]), 'world');
  assert.equal(slotFor('sea').impl, 'legacy', 'registered, but not chosen');
  runLayer('sea', w, {}, {}); assert.equal(seen.length, 0); assert.equal(w.calls.at(-1)[0], 'drawWater');
  assert.equal(setFlag('sea', 'v2'), 'v2'); w.calls.length = 0;
  runLayer('sea', w, {}, {}, 'subject'); assert.deepEqual(seen, [['v2 sea', 'env', 'subject']]); assert.deepEqual(w.calls, ['toWorld'], 'the V2 sea is drawn in world space');
  assert.equal(setFlag('sea', 'legacy'), 'legacy'); w.calls.length = 0; runLayer('sea', w, {}, {}); assert.equal(w.calls[0], 'toScreen');
  setFlag('terrain', 'v2'); assert.equal(slotFor('terrain').impl, 'legacy', 'a layer with no V2 stays legacy even when flagged');
  assert.throws(() => setFlag('sea', 'v3'), /legacy or v2/); assert.throws(() => setFlag('nope', 'v2'), /no layer/);
  reset();
});

test('flags can be set from an address-style string; unknown ids and impls are skipped', () => {
  reset(); registerLayer('clouds', () => {}, 'world'); registerLayer('grade', () => {}, 'screen');
  assert.deepEqual(setFlags('clouds:v2, grade:v2, bogus:v2, sea:v9, :'), ['clouds', 'grade']);
  assert.equal(FLAGS.clouds, 'v2'); assert.equal(FLAGS.sea, 'legacy');
  setFlags('all:legacy'); for (const L of LAYERS) assert.equal(FLAGS[L.id], 'legacy');
  assert.deepEqual(setFlags(''), []); assert.deepEqual(setFlags(null), []);
  reset();
});
