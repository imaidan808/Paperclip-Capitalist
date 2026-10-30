// The layer stack (js/world/stack.js): the table of layers, the flags that choose a legacy or a V2 drawer, and the runner. The default build runs every V2 drawer (the merged art tracks); ?layers=all:legacy is the old picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, FLAGS, IMPLS, registerLayer, registerProp, propV2, propKindsV2, staticLayerOf, BUILDING_KINDS, setFlag, setFlags, slotFor, layerInfo, runLayer } from '../js/world/stack.js';
import { World } from '../js/world/world.js';

/** A stand-in world: it records the method each legacy adapter calls and the spaces the runner sets. */
function fakeWorld() {
  const calls = [], w = { env: { tag: 'env' }, calls };
  w.toScreen = () => calls.push('toScreen'); w.toWorld = () => calls.push('toWorld');
  return new Proxy(w, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push([String(k), ...a]); }) });
}
const reset = () => { for (const L of LAYERS) setFlag(L.id, 'legacy'); };
/** Every layer's flag is v2 in the default build (stack.js V2_DEFAULT: the merged art tracks). The two static layers (bridge: T5) have no whole-layer drawer: their V2 is per kind (registerProp), so their slot stays the frame's. */
const V2_AT_START = new Set(LAYERS.map((l) => l.id));

test('the table: every layer has a unique id, an owner T1 to T5, a space and a stage; and the build starts with every flag on v2', () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const L of LAYERS) {
    assert.match(L.owner, /^T[1-5]$/, L.id); assert.ok(['screen', 'world', 'inherit'].includes(L.space), L.id); assert.ok(['sea', 'ground', 'things', 'air', 'screen'].includes(L.stage), L.id); assert.equal(typeof L.legacy, 'function');
    assert.equal(FLAGS[L.id], V2_AT_START.has(L.id) ? 'v2' : 'legacy', `${L.id} must start as ${V2_AT_START.has(L.id) ? 'v2' : 'legacy'}`); assert.equal(slotFor(L.id).impl, L.bridge ? 'legacy' : 'v2', `${L.id}: a layer with its own V2 drawer runs it; a bridged static layer is drawn per kind`); assert.equal(layerInfo(L.id), L);
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
  setFlag('static-bldg', 'v2'); assert.equal(slotFor('static-bldg').impl, 'legacy', 'a layer with no whole-layer V2 stays legacy even when flagged (its kinds register one by one)');
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

test('the static props are two layers, one per owner, over one frame: T3 draws the 18 building kinds, T4 every other kind, and statics.js (T5) stays the shared frame', () => {
  const b = layerInfo('static-bldg'), p = layerInfo('static-prop'); assert.equal(b.owner, 'T3'); assert.equal(p.owner, 'T4'); assert.equal(b.bridge, 'T5'); assert.equal(p.bridge, 'T5'); assert.equal(layerInfo('static'), undefined, 'the one row is gone from the table');
  assert.equal(BUILDING_KINDS.size, 18); for (const t of ['bldg', 'tower', 'shop', 'rentrow']) assert.equal(staticLayerOf(t), 'static-bldg', t);
  for (const t of ['tree', 'lamp', 'crane', 'autos', 'containers', 'gate', 'nonsense', undefined, 'constructor']) assert.equal(staticLayerOf(t), 'static-prop', String(t));
  reset(); const w = fakeWorld(); runLayer('static', w, {}, {}, { t: 'tower' }); assert.deepEqual(w.calls.map((c) => c[0]), ['drawStatic'], 'the engine\'s one call goes through the frame, whichever layer the kind is in');
  w.calls.length = 0; runLayer('static', w, {}, {}, undefined); assert.equal(w.calls.length, 1, 'a missing subject is a prop of no kind, not an error');
});
test('a whole-layer V2 drawer cannot be registered for a static layer (its kinds are registered one at a time); the sea\'s V2 must be world space, as the table says', () => {
  assert.throws(() => registerLayer('static-bldg', () => {}), /registerProp/); assert.throws(() => registerLayer('static-prop', () => {}, 'world'), /registerProp/);
  assert.equal(layerInfo('sea').v2space, 'world'); assert.throws(() => registerLayer('sea', () => {}, 'screen'), /world space/); assert.throws(() => registerLayer('sea', () => {}, 'inherit'), /world space/);
  assert.equal(layerInfo('grade').v2space, undefined, 'a layer whose V2 keeps the legacy space says nothing'); registerLayer('grade', () => {}, 'world'); reset();
});
test('registerProp: a kind has a V2 drawer only while ITS layer is flagged v2; the other owner\'s flag and kinds are untouched; a bad registration throws', () => {
  reset(); const f = () => null;
  assert.throws(() => registerProp('', f), /name/); assert.throws(() => registerProp('tower', 'no'), /function/); assert.throws(() => registerProp('tower', {}), /function/); assert.throws(() => registerProp(7, f), /name/);
  registerProp('tower', f); registerProp('lamp', { body: () => [[[0, 0]]] });
  assert.ok(propKindsV2().includes('tower') && propKindsV2().includes('lamp'));
  assert.equal(propV2('tower'), undefined, 'registered, not flagged: legacy'); assert.equal(propV2('lamp'), undefined);
  setFlag('static-bldg', 'v2'); assert.equal(typeof propV2('tower').draw, 'function'); assert.equal(propV2('lamp'), undefined, 'T4\'s kinds do not follow T3\'s flag'); assert.equal(propV2('shop'), undefined, 'a building kind with no registration stays legacy');
  setFlag('static-prop', 'v2'); const lamp = propV2('lamp'); assert.equal(typeof lamp.body, 'function'); assert.equal(typeof lamp.draw, 'function', 'a layer definition gets the plain body-then-live drawer'); assert.deepEqual(lamp.draw({}, {}, {}), [[[0, 0]]]);
  setFlag('static-bldg', 'legacy'); assert.equal(propV2('tower'), undefined, 'flipping back restores the legacy drawer'); assert.equal(typeof propV2('lamp').body, 'function');
  assert.deepEqual(setFlags('static-bldg:v2'), ['static-bldg'], 'the address flag names the layer'); assert.equal(typeof propV2('tower').draw, 'function');
  assert.deepEqual(setFlags('all:legacy'), LAYERS.map((l) => l.id));   assert.equal(propV2('tower'), undefined); reset();
});
