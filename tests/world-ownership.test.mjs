// The render plan's two machine-checked blocks (docs/RENDER_PLAN.md) against the code: the layer table against js/world/stack.js, and the ownership table against the files in js/world/.
// No two tracks own one file, no file is unowned, a file's own "Owner:" line agrees with the table, and each layer's legacy drawer lives in a module its own track owns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LAYERS } from '../js/world/stack.js';

const DOC = readFileSync(new URL('../docs/RENDER_PLAN.md', import.meta.url), 'utf8');
const DIR = new URL('../js/world/', import.meta.url);
const block = (marker) => { const m = DOC.match(new RegExp('<!-- ' + marker + ' -->\\s*```json\\n([\\s\\S]*?)\\n```')); assert.ok(m, `the ${marker} block is missing`); return JSON.parse(m[1]); };
const OWNERS = block('render-owners'), PLAN_LAYERS = block('render-layers');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const ownerOf = {}; for (const [t, fs] of Object.entries(OWNERS)) for (const f of fs) { assert.equal(ownerOf[f], undefined, `${f} is owned by two tracks`); ownerOf[f] = t; }

test('the plan has five tracks, T1 to T5', () => assert.deepEqual(Object.keys(OWNERS), ['T1', 'T2', 'T3', 'T4', 'T5']));

test('the layer table of the plan is the layer table of stack.js, row for row', () => {
  assert.deepEqual(PLAN_LAYERS, LAYERS.map((l) => ({ id: l.id, owner: l.owner, space: l.space, stage: l.stage })));
});

test('every file in js/world/ has exactly one owner, and the table names no file that is not there', () => {
  assert.deepEqual(FILES.filter((f) => !ownerOf[f]), [], 'unowned files: add them to the ownership block of docs/RENDER_PLAN.md');
  assert.deepEqual(Object.keys(ownerOf).filter((f) => !FILES.includes(f)), [], 'the table names files that do not exist');
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
    assert.equal(ownerOf[defs[0]], L.owner, `${L.id} is ${L.owner}'s but ${name} lives in ${defs[0]} (${ownerOf[defs[0]]})`);
  }
});

test('the engine imports no art module by name except through the mixins and the stack, and the art modules import nothing from world.js', () => {
  for (const f of FILES) {
    if (f === 'world.js') continue;
    const src = readFileSync(new URL(f, DIR), 'utf8');
    assert.ok(!/from '\.\/world\.js'/.test(src), `${f} imports world.js (a cycle with the mixins)`);
  }
});
