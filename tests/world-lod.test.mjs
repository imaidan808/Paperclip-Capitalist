// The level-of-detail ladder (js/world/lod.js): four bands, one crossfade rule, a pure function of the zoom. The numbers are the art direction's (docs/ART_DIRECTION.md section 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lodOf, detailAlpha, bandIndex, BANDS, BAND_AT, FADE, DETAIL_MIN } from '../js/world/lod.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);

test('the four bands start at 0.30, 0.70 and 1.40 and the nominal band follows them', () => {
  assert.deepEqual([...BANDS], ['far', 'mid', 'near', 'close']);
  assert.deepEqual([...BAND_AT], [0.30, 0.70, 1.40]);
  for (const [z, band] of [[0.129, 'far'], [0.2999, 'far'], [0.30, 'mid'], [0.5, 'mid'], [0.6999, 'mid'], [0.70, 'near'], [1.0, 'near'], [1.3999, 'near'], [1.40, 'close'], [2.4, 'close']]) assert.equal(lodOf(z).nominal, band, `zoom ${z}`);
  assert.equal(bandIndex(0.9), 2);
});

test('the base picture is always complete: detail[0] is 1 at every zoom, and every alpha stays between 0 and 1', () => {
  for (let z = 0.1; z <= 2.5; z += 0.01) { const { detail } = lodOf(z); assert.equal(detail[0], 1); for (const a of detail) assert.ok(a >= 0 && a <= 1, `alpha ${a} at ${z}`); }
});

test('a band\'s marks fade in over plus or minus 15% of its threshold: 0 at the start of the fade, 0.5 at the threshold, 1 at the end', () => {
  assert.equal(FADE, 0.15);
  for (const [i, t] of [[1, 0.30], [2, 0.70], [3, 1.40]]) {
    near(lodOf(t * 0.85).detail[i], 0); near(lodOf(t * 0.85 + 1e-9).detail[i], 0); near(lodOf(t).detail[i], 0.5); near(lodOf(t * 1.15).detail[i], 1);
    assert.equal(lodOf(t * 0.8).detail[i], 0); assert.equal(lodOf(t * 1.2).detail[i], 1);
  }
  // the numbers the art direction states: detailNear over zoom 0.595 to 0.805, detailClose over 1.19 to 1.61
  near(detailAlpha(0.595, 0.70), 0); near(detailAlpha(0.805, 0.70), 1); near(detailAlpha(1.19, 1.40), 0); near(detailAlpha(1.61, 1.40), 1);
});

test('nothing pops: the alphas only grow with the zoom and never jump', () => {
  let prev = lodOf(0.1);
  const p = { detail: [...prev.detail], level: prev.level };
  for (let z = 0.101; z <= 2.5; z += 0.001) {
    const r = lodOf(z);
    for (let i = 1; i < 4; i++) { assert.ok(r.detail[i] >= p.detail[i] - 1e-12, `detail ${i} fell at ${z}`); assert.ok(r.detail[i] - p.detail[i] <= 0.03, `detail ${i} jumped at ${z}`); }
    assert.ok(r.level >= p.level - 1e-12 && r.level - p.level <= 0.03, `level jumped at ${z}`);
    p.detail = [...r.detail]; p.level = r.level;
  }
});

test('the finest visible band, its blend and the level agree, and a finer band appears only once its alpha clears the floor', () => {
  for (let z = 0.1; z <= 2.5; z += 0.005) {
    const r = lodOf(z), d = r.detail;
    assert.equal(r.band, BANDS[r.index]); assert.equal(r.blend, d[r.index]);
    assert.ok(r.index === 0 || d[r.index] > DETAIL_MIN, `band ${r.index} at ${z} has alpha ${d[r.index]}`);
    if (r.index < 3) assert.ok(d[r.index + 1] <= DETAIL_MIN, `a finer band is visible at ${z}`);
    near(r.level, d[1] + d[2] + d[3]);
    near(r.level, r.index === 0 ? 0 : r.index - 1 + r.blend, 1e-9);
  }
  assert.equal(lodOf(0.129).band, 'far'); assert.equal(lodOf(0.9).band, 'near'); assert.equal(lodOf(2.4).band, 'close'); near(lodOf(2.4).level, 3);
});

test('lodOf writes into the record it is given and allocates nothing new (the world calls it every frame)', () => {
  const out = { detail: [9, 9, 9, 9] }, d = out.detail, r = lodOf(1.0, out);
  assert.equal(r, out); assert.equal(r.detail, d); assert.equal(d[0], 1); assert.equal(r.band, 'near');
  assert.equal(lodOf(0.2, out).band, 'far'); assert.equal(out.detail, d);
  assert.notEqual(lodOf(1.0), lodOf(1.0), 'without a record each call makes its own');
});
