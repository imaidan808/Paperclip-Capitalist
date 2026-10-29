// The render plan's two machine-checked blocks (docs/RENDER_PLAN.md) against the code: the layer table against js/world/stack.js, and the ownership table against the files in js/world/.
// No two tracks own one file, no file is unowned, a file's own "Owner:" line agrees with the table, and each layer's legacy drawer lives in a module its own track owns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LAYERS } from '../js/world/stack.js';

const DOC = readFileSync(new URL('../docs/RENDER_PLAN.md', import.meta.url), 'utf8');
const DIR = new URL('../js/world/', import.meta.url);
const block = (marker) => { const m = DOC.match(new RegExp('<!-- ' + marker + ' -->\\s*```json\\n([\\s\\S]*?)\\n```')); assert.ok(m, `the ${marker} block is missing`); return JSON.parse(m[1]); };
const OWNERS = block('render-owners'), PLAN_LAYERS = block('render-layers'), LATER = OWNERS.later || {};
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const TRACKS = Object.keys(OWNERS).filter((t) => t !== 'later');
const ownerOf = {}; for (const t of TRACKS) for (const f of OWNERS[t]) { assert.equal(ownerOf[f], undefined, `${f} is owned by two tracks`); ownerOf[f] = t; }
for (const [f, t] of Object.entries(LATER)) { assert.equal(ownerOf[f], undefined, `${f} is both in a track's array and in \`later\``); assert.match(t, /^T[1-5]$/); }

test('the plan has five tracks, T1 to T5', () => assert.deepEqual(TRACKS, ['T1', 'T2', 'T3', 'T4', 'T5']));

test('the layer table of the plan is the layer table of stack.js, row for row (a layer says its V2 space and its bridge only where it has them)', () => {
  assert.deepEqual(PLAN_LAYERS, LAYERS.map((l) => ({ id: l.id, owner: l.owner, space: l.space, ...(l.v2space ? { v2space: l.v2space } : {}), stage: l.stage, ...(l.bridge ? { bridge: l.bridge } : {}) })));
});

test('every file in js/world/ has exactly one owner, and the table names no file that is not there (a `later` file may be absent: it belongs to a branch not yet merged)', () => {
  assert.deepEqual(FILES.filter((f) => !ownerOf[f] && !LATER[f]), [], 'unowned files: add them to YOUR track\'s array in the ownership block of docs/RENDER_PLAN.md (one file to a line)');
  assert.deepEqual(Object.keys(ownerOf).filter((f) => !FILES.includes(f)), [], 'the table names files that do not exist');
});

test('each track\'s array is one file to a line, so two tracks adding files in one merge never touch adjacent lines', () => {
  const m = DOC.match(/<!-- render-owners -->\s*```json\n([\s\S]*?)\n```/)[1].split('\n');
  for (const t of TRACKS) { const at = m.findIndex((l) => l.trim().startsWith(`"${t}": [`)); assert.ok(at >= 0, t); for (let i = 1; i <= OWNERS[t].length; i++) assert.match(m[at + i], /^\s+"[a-z-]+\.js",?$/, `${t}: line ${i} is not exactly one file`); }
});

test('the prop modules belong to the layers they feed: props-buildings.js is T3\'s (the static-bldg layer), the other three prop modules are T4\'s (static-prop), and the shared frame and frozen helpers are T5\'s', () => {
  assert.equal(ownerOf['props-buildings.js'], 'T3'); for (const f of ['props-street.js', 'props-nature.js', 'props-actors.js']) assert.equal(ownerOf[f], 'T4', f);
  for (const f of ['statics.js', 'props.js', 'props-common.js', 'shading.js', 'iso.js']) assert.equal(ownerOf[f], 'T5', f);
  for (const id of ['static-bldg', 'static-prop']) { const L = LAYERS.find((l) => l.id === id); assert.equal(L.bridge, 'T5'); }
  assert.equal(LAYERS.find((l) => l.id === 'static-bldg').owner, ownerOf['props-buildings.js']); assert.equal(LAYERS.find((l) => l.id === 'static-prop').owner, ownerOf['props-street.js']);
});

test('a module that says who owns it says the same as the table', () => {
  let said = 0;
  for (const f of FILES) {
    const head = readFileSync(new URL(f, DIR), 'utf8').split('\n').slice(0, 14).join('\n'), m = head.match(/Owner: (?:\()?(T[1-5])\b/);
    if (!m) continue; said++;
    assert.equal(ownerOf[f], m[1], `${f} says ${m[1]} but the plan says ${ownerOf[f]}`);
  }
  assert.ok(said >= 20, `only ${said} modules say who owns them`);
});

test('each layer\'s legacy drawer is defined in one module, and that module belongs to the layer\'s own track', () => {
  const methodOf = (L) => { let name = null; const w = new Proxy({}, { get: (_, k) => (...a) => { name = String(k); } }); L.legacy({}, {}, {}, w, { far: false, see: () => true, zoom: 1, mode: 0 }); return name; };
  for (const L of LAYERS) {
    const name = methodOf(L), defs = FILES.filter((f) => f !== 'world.js' && f !== 'stack.js' && new RegExp('^  ' + name + '\\(', 'm').test(readFileSync(new URL(f, DIR), 'utf8')));
    assert.equal(defs.length, 1, `${L.id}: ${name} is defined in ${defs.join(', ') || 'no module'}`);
    assert.equal(ownerOf[defs[0]], L.bridge || L.owner, `${L.id} is ${L.bridge ? 'drawn through ' + L.bridge + '\'s frame' : L.owner + '\'s'} but ${name} lives in ${defs[0]} (${ownerOf[defs[0]]})`);
  }
});

test('the engine imports no art module by name except through the mixins and the stack, and the art modules import nothing from world.js', () => {
  for (const f of FILES) {
    if (f === 'world.js') continue;
    const src = readFileSync(new URL(f, DIR), 'utf8');
    assert.ok(!/from '\.\/world\.js'/.test(src), `${f} imports world.js (a cycle with the mixins)`);
  }
});
