// The nine cameras of the author's screenshots of 2026-11-04 (tests/fixtures/author-cameras.json) are a shot set: scripts/world-author-shots.mjs draws them, by hand, in Chrome, as the "before" and "after" of every change to the roads, the
// districts or the grade. This holds the table to the island, without a browser:
//   AC1  nine cameras, numbered 1 to 9, each with a district, a world position, a zoom of 0.57 to 0.63, an hour, a tier, the screenshot's size and the road defect classes that show in it
//   AC2  each camera looks at the district it names: the world pixel in the middle of the picture, taken back to the ground at the district's height, is on that district's footprint (camera 1 and 9 at the edge of it) and no other's
//   AC3  the shots without lamps and lookout decks (3 to 6) are the governor's tier 3 and the rest tier 0, and the nine hours are the ones the tint of each screenshot was matched at (dusk to night)
//   AC4  the picture fits the canvas the script draws (the window of the fixture at its density), and the script lists the same nine cameras without starting a browser
// The pictures themselves are not tested here (they need Chrome and are compared by eye); the script is run by hand: node scripts/world-author-shots.mjs --out DIR
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, DIST, zAt, rectDist } from '../js/world/layout.js';
import { toGrid } from '../js/world/iso.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/author-cameras.json'), 'utf8')), CAMS = FIXTURE.cameras;
const CLASSES = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12']);

test('AC1: nine cameras, numbered 1 to 9, each with its district, position, zoom, hour, tier, size and defects', () => {
  assert.deepEqual(CAMS.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(FIXTURE.window, [1440, 900]); assert.equal(FIXTURE.dsf, 2); assert.equal(FIXTURE.seed, 20260101);
  for (const c of CAMS) {
    const k = 'camera ' + c.n;
    assert.ok(LAYOUT.ids.includes(c.district), k + ' names a district');
    assert.ok(c.world.length === 2 && c.world.every(Number.isFinite), k + ' has a world position');
    assert.ok(Math.round(c.zoom * 100) / 100 >= 0.57 && c.zoom <= 0.63, `${k}: zoom ${c.zoom} is 0.57 to 0.63 (the author's zoom throughout)`);
    assert.ok(c.hour >= 0 && c.hour < 24, k + ' has an hour of the day'); assert.equal(typeof c.lite, 'boolean', k + ' says whether it was drawn in the governor\'s lite tier');
    assert.ok(c.crop.length === 2 && c.crop.every((v) => v > 300), k + ' has the size of its screenshot'); assert.match(c.file, /^Screenshot 2026-11-04 at 6\.3\d\.\d\d PM\.png$/, k + ' names the screenshot it reproduces');
    assert.ok(c.defects.length > 0 && c.defects.every((d) => CLASSES.has(d)), `${k}: its defects are classes of the road detector (scripts/lib/road-audit.mjs): ${c.defects}`); assert.ok(c.what.length > 40, k + ' says what it shows');
  }
  assert.deepEqual([...new Set(CAMS.map((c) => c.district))].sort((a, b) => a - b), [3, 4, 8, 9, 10, 11, 12], 'the screenshots are in districts 3, 4, 8, 9, 10, 11 and 12 (12 three times)');
  assert.deepEqual(CAMS.filter((c) => c.district === 12).map((c) => c.n), [1, 2, 3]);
  assert.deepEqual(FIXTURE.open, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'the author\'s saves had twelve districts open: the road to 13 is drawn locked, as in screenshots 1 and 3');
});

test('AC2: each camera looks at the district it names: its middle, taken back to the ground, is on that district\'s footprint or at its edge, and no other district is nearer', () => {
  for (const c of CAMS) {
    let g = toGrid(c.world[0], c.world[1], 0); for (let i = 0; i < 4; i++) g = toGrid(c.world[0], c.world[1], zAt(g[0], g[1])); // (World.unproject: the ground's height under the point)
    const d = rectDist(g[0], g[1], DIST[c.district].fp), nearest = LAYOUT.ids.map((id) => [id, rectDist(g[0], g[1], DIST[id].fp)]).sort((a, b) => a[1] - b[1])[0];
    assert.ok(d <= 4, `camera ${c.n} looks ${d.toFixed(1)} tiles beyond district ${c.district}'s footprint at grid (${g.map((v) => v.toFixed(1))})`);
    assert.equal(nearest[0], c.district, `camera ${c.n}: district ${c.district} is the nearest, not ${nearest[0]}`);
  }
  for (const n of [2, 3, 4, 5, 6, 7, 8]) { const c = CAMS[n - 1]; let g = toGrid(c.world[0], c.world[1], 0); for (let i = 0; i < 4; i++) g = toGrid(c.world[0], c.world[1], zAt(g[0], g[1])); assert.equal(LAYOUT.footAt(g[0], g[1]), c.district, `camera ${n} is on the footprint of district ${c.district}`); }
});

test('AC3: the shots without lamps and lookout decks (3 to 6) are the lite tier, the rest are not, and the hours put them in the evening and at night', () => {
  assert.deepEqual(CAMS.filter((c) => c.lite).map((c) => c.n), [3, 4, 5, 6], 'screenshots 3 to 6 have no lamp posts and no lookout decks: what js/world/world.js does below zoom 0.6 in the governor\'s tier 3');
  assert.deepEqual(CAMS.map((c) => c.hour), [17, 18.5, 19.5, 22, 20, 22, 20, 20, 18.25], 'the hours found by matching the tint of each screenshot (docs/RENDER_PLAN.md, section 9)');
  assert.ok(CAMS.every((c) => c.hour >= 17 && c.hour <= 22), 'all nine were taken from dusk to night');
});

test('AC4: each picture fits the canvas the script draws, and the script lists the same nine cameras without starting a browser', () => {
  const [w, h] = FIXTURE.window;
  for (const c of CAMS) assert.ok(c.crop[0] <= w * FIXTURE.dsf && c.crop[1] <= h * FIXTURE.dsf, `camera ${c.n}: ${c.crop} fits ${w * FIXTURE.dsf} x ${h * FIXTURE.dsf}`);
  const listed = execFileSync(process.execPath, [join(ROOT, 'scripts/world-author-shots.mjs'), '--list'], { encoding: 'utf8', timeout: 60000 }).trim().split('\n');
  assert.equal(listed.length, 9); listed.forEach((line, i) => assert.ok(line.startsWith(String(i + 1)) && line.includes(`district ${CAMS[i].district}`) && line.includes(`zoom ${CAMS[i].zoom.toFixed(3)}`), line));
  const two = execFileSync(process.execPath, [join(ROOT, 'scripts/world-author-shots.mjs'), '--list', '--only', '4,6'], { encoding: 'utf8', timeout: 60000 }).trim().split('\n');
  assert.equal(two.length, 2, '--only chooses cameras'); assert.ok(two[0].startsWith('4') && two[1].startsWith('6'));
});
