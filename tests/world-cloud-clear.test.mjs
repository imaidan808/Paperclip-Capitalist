// An open district is never under its neighbours' clouds (the first judge pass: at the island's fit view the player's own district, the Scrap Yard, was buried: its crates, roof and crane).
//   C1  clearOpen erases a footprint from a baked chunk: wide faint strokes outwards (the soft edge), then the footprint whole, all with destination-out, inside one save and restore
//   C2  the clouds' chunk painter calls it once, after every bank, for the open districts; the live path (which paints on the frame itself, where erasing would erase the ground) never does
// Run: node --test tests/world-cloud-clear.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { clearOpen, FEATHER } = await import('../js/world/clouds.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const fake = () => {
  const ops = [], g = { globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineJoin: 'miter',
    save() { ops.push('save'); this._s = { a: this.globalAlpha, c: this.globalCompositeOperation }; }, restore() { ops.push('restore'); if (this._s) { this.globalAlpha = this._s.a; this.globalCompositeOperation = this._s.c; } },
    beginPath() { ops.push('begin'); }, moveTo(x, y) { ops.push(['move', x, y]); }, lineTo(x, y) { ops.push(['line', x, y]); }, closePath() { ops.push('close'); },
    stroke() { ops.push(['stroke', this.lineWidth, this.globalAlpha, this.globalCompositeOperation]); }, fill() { ops.push(['fill', this.globalAlpha, this.globalCompositeOperation]); } };
  return { g, ops };
};

test('C1: clearOpen cuts a footprint out of a chunk with a soft edge: faint wide strokes, then the footprint whole, all as destination-out inside one save and restore', () => {
  const { g, ops } = fake(), sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  clearOpen(g, [sq]);
  assert.equal(ops[0], 'save'); assert.equal(ops.at(-1), 'restore'); assert.equal(ops.filter((o) => o === 'save').length, 1);
  const strokes = ops.filter((o) => o[0] === 'stroke'), fills = ops.filter((o) => o[0] === 'fill');
  assert.deepEqual(strokes.map((o) => [o[1], o[2]]), FEATHER.map(([w, a]) => [w, a]), 'the feather: the widest and faintest first');
  assert.equal(fills.length, 1); assert.equal(fills[0][1], 1, 'the footprint itself is erased whole');
  for (const o of [...strokes, ...fills]) assert.equal(o.at(-1), 'destination-out', 'it erases, it does not paint');
  assert.ok(FEATHER.every(([w, a], i) => i === 0 || (w < FEATHER[i - 1][0] && a > FEATHER[i - 1][1])), 'each narrower stroke is stronger: the edge fades out, not in');
  assert.equal(g.globalCompositeOperation, 'source-over', 'and the surface is as it was after');
  const two = fake(); clearOpen(two.g, [sq, sq.map(([x, y]) => [x + 300, y])]); assert.equal(two.ops.filter((o) => o[0] === 'fill').length, 2, 'every open district');
  const none = fake(); clearOpen(none.g, []); clearOpen(none.g, null); assert.equal(none.ops.length, 0, 'nothing open: nothing touched');
});

test('C2: the chunk painter clears the open districts once, after every bank, and the live path never erases', () => {
  const src = readFileSync(join(ROOT, 'js/world/clouds.js'), 'utf8');
  assert.equal((src.match(/clearOpen\(/g) || []).length, 2, 'the definition and the one call');
  assert.match(src, /paintLobes\(g, b\.lobes[^\n]*\n\s*clearOpen\(g, st\.open\);/, 'in the chunk painter, after the banks');
  assert.match(src, /const open = st\.open; open\.length = 0; if \(ps > 1 && w\.unlocked\) for \(const id of LAYOUT\.ids\) if \(w\.unlocked\.has\(id\)\) open\.push\(openPoly\(DIST\[id\]\)\);/, 'from the world\'s open districts at the coarse and far lattices only, before the chunks are keyed');
});
