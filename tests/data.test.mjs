// v2 content validation. Loads whichever of js/data/tier1..4.js exist (so authors can validate their own tier in isolation)
// and requires all four, plus the cross-tier rules, once they are merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { validateData } from '../js/data/schema.js';

const merged = { zones: {}, assets: {}, buyers: {} };
const present = [];
for (const t of [1, 2, 3, 4]) {
  const path = new URL(`../js/data/tier${t}.js`, import.meta.url);
  if (!existsSync(path)) continue;
  const m = await import(path.href);
  present.push(t);
  for (const k of ['zones', 'assets', 'buyers']) {
    assert.ok(m[k] && typeof m[k] === 'object', `tier${t}.js must export { zones, assets, buyers }`);
    for (const id of Object.keys(m[k])) { assert.ok(!(id in merged[k]), `${k} "${id}" is defined by two tiers`); merged[k][id] = m[k][id]; }
  }
}
const partial = present.length < 4;

test(`content is valid (tiers present: ${present.join(', ') || 'none'}${partial ? '; partial check' : ''})`, { skip: !present.length && 'no tier files yet' }, () => {
  const problems = validateData(merged, { partial });
  assert.deepEqual(problems, [], '\n' + problems.slice(0, 60).join('\n') + (problems.length > 60 ? `\n...and ${problems.length - 60} more` : ''));
});

test('each tier owns exactly its four districts', { skip: !present.length && 'no tier files yet' }, () => {
  for (const t of present) {
    const m = [1, 2, 3, 4].map((i) => (t - 1) * 4 + i);
    const zs = Object.keys((merged.zones)).map(Number).filter((z) => Math.ceil(z / 4) === t);
    assert.deepEqual(zs.sort((a, b) => a - b), m, `tier ${t} must define zones ${m.join(', ')}`);
  }
});
