// v2 content validation. Loads whichever of js/data/tier1..4.js exist (so authors can validate their own tier in isolation)
// and requires all four, plus the cross-tier rules, once they are merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { validateData, demandOf, TEACHES, TIER_ASSETS, TIER_BUYERS, TIER_TAGS, BONUS_EXPECT, RULE_NEED, UNLOCK_RULES, KEEP_ASSETS, KEEP_BUYERS } from '../js/data/schema.js';

const merged = { zones: {}, assets: {}, buyers: {} };
const tiers = {};
for (const t of [1, 2, 3, 4]) {
  const path = new URL(`../js/data/tier${t}.js`, import.meta.url);
  if (!existsSync(path)) continue;
  const m = await import(path.href);
  tiers[t] = m;
  for (const k of ['zones', 'assets', 'buyers']) {
    assert.ok(m[k] && typeof m[k] === 'object', `tier${t}.js must export { zones, assets, buyers }`);
    for (const id of Object.keys(m[k])) { assert.ok(!(id in merged[k]), `${k} "${id}" is defined by two tiers`); merged[k][id] = m[k][id]; }
  }
}
const present = Object.keys(tiers).map(Number);
const partial = present.length < 4;
const skip = !present.length && 'no tier files yet';

test(`content is valid (tiers present: ${present.join(', ') || 'none'}${partial ? '; partial check' : ''})`, { skip }, () => {
  const problems = validateData(merged, { partial });
  assert.deepEqual(problems, [], '\n' + problems.slice(0, 60).join('\n') + (problems.length > 60 ? `\n...and ${problems.length - 60} more` : ''));
});

test('each tier owns exactly its four districts and its own buyers', { skip }, () => {
  for (const t of present) {
    const mine = [1, 2, 3, 4].map((i) => (t - 1) * 4 + i);
    assert.deepEqual(Object.keys(tiers[t].zones).map(Number).sort((a, b) => a - b), mine, `tier ${t} must define zones ${mine.join(', ')}`);
    for (const [id, b] of Object.entries(tiers[t].buyers)) assert.ok(mine.includes(b.zone), `tier ${t}: buyer ${id} sits in zone ${b.zone}, outside ${mine.join(', ')}`);
  }
});

test('tier-local rules: owned v1 ids, home tags, demand only at home, signature goods, counts', { skip }, () => {
  for (const t of present) {
    const { zones, assets, buyers } = tiers[t];
    const mine = Object.keys(zones).map(Number);
    for (const id of TIER_ASSETS[t]) assert.ok(assets[id], `tier ${t} must define v1 asset "${id}"`);
    for (const id of TIER_BUYERS[t]) assert.ok(buyers[id], `tier ${t} must define v1 buyer "${id}"`);
    for (const id of Object.keys(assets)) if (KEEP_ASSETS.includes(id)) assert.ok(TIER_ASSETS[t].includes(id), `tier ${t} must not define "${id}" (owned by another tier)`);
    for (const id of Object.keys(buyers)) if (KEEP_BUYERS.includes(id)) assert.ok(TIER_BUYERS[t].includes(id), `tier ${t} must not define buyer "${id}" (owned by another tier)`);
    assert.ok(Object.keys(assets).length >= 14, `tier ${t}: needs at least 14 assets (has ${Object.keys(assets).length})`);
    assert.ok(Object.keys(buyers).length >= 20, `tier ${t}: needs at least 20 buyers (has ${Object.keys(buyers).length})`);
    for (const [id, a] of Object.entries(assets)) {
      for (const [z, d] of Object.entries(a.dem || {})) if (!mine.includes(+z)) assert.ok(d <= 3, `tier ${t}: asset ${id} has demand ${d} in district ${z} outside the tier (max 3 there)`);
      const sig = mine.some((z) => demandOf(a, z) >= 6 && a.base >= zones[z].scale * 0.08 && a.base <= zones[z].scale * 3.5);
      assert.ok(sig, `tier ${t}: asset ${id} is not a signature good (demand >= 6, base 0.08x..3.5x of scale) in any of the tier's districts`);
    }
    for (const tag of TIER_TAGS[t]) {
      assert.ok(Object.values(assets).some((a) => a.tags.includes(tag)), `tier ${t}: no asset carries home tag "${tag}"`);
      assert.ok(Object.values(buyers).some((b) => (b.like || {})[tag] > 0), `tier ${t}: no buyer likes home tag "${tag}"`);
    }
    for (const z of mine) {
      const d = zones[z];
      assert.equal(d.teaches, TEACHES[z - 1], `zone ${z}: teaches must be "${TEACHES[z - 1]}"`);
      assert.deepEqual(d.bonus, BONUS_EXPECT[z] || {}, `zone ${z}: bonus must be ${JSON.stringify(BONUS_EXPECT[z] || {})}`);
      for (const k of RULE_NEED[z]) assert.ok(d.rules[k] !== undefined && d.rules[k] !== false, `zone ${z}: rules.${k} is the district's signature rule and is required`);
      for (const [k, at] of Object.entries(UNLOCK_RULES)) assert.equal(!!d.rules[k], at === z, `zone ${z}: rules.${k} must be ${at === z ? 'true' : 'absent'} (feature unlocks in district ${at})`);
      const near = (n, lo, hi) => typeof n === 'number' && n >= lo && n <= hi;
      if (z === 3) assert.ok(d.rules.season.period === 28 && near(d.rules.season.amp, 0.15, 0.6) && d.rules.season.tags.length >= 2, 'zone 3: season period 28 with amp 0.15..0.6 and >= 2 tags');
      if (z === 4) assert.ok(near(d.rules.fakes, 0.18, 0.26) && near(d.rules.auction, 0.2, 0.5), 'zone 4: fakes about 0.22 and auction 0.2..0.5');
      if (z === 6) assert.ok(near(d.rules.auction, 0.5, 0.7), 'zone 6: auction 0.5..0.7');
      if (z === 7) assert.ok(near(d.rules.repair, 0.2, 0.3), 'zone 7: repair 0.2..0.3');
      if (z === 8) assert.ok(near(d.rules.customs, 0.1, 0.4), 'zone 8: customs 0.1..0.4');
    }
  }
});
