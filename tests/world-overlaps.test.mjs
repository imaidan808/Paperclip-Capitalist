// Three props that hide what they stand beside (the late-districts survey of 2026-11-04, S11, S12 and S18; the layouts are js/world/kits.js and layout.js, the art is street.js and bldg-civic.js). The camera shows the south and east faces, and a prop is drawn
// over everything with a smaller depth key, so a tall sign a tile in front of a thing hides it. Each test measures in the picture, in world pixels (iso.js P: x grows to the right and down, y to the left and down, z up), what the art draws:
//   OV1  signs do not stand on signs (S11): in no district do two signs the kits placed (a market board, a billboard, a ticker, a for-sale post) overlap in the picture; in Creative Quarter the pink NEW billboard stood against the market board and drew over
//        it (their depth keys were 103.95 and 103.35 in the sweep's numbers), so the board showed BUYERS with its number cut off, and the number is its content (the board is a hot spot)
//   OV2  the FOR SALE post does not hide the lots (S12): in Real Estate Row it stood in front of the first two lot crates and hid their lower halves; it clears every one of the eight crates' places, and the depot
//   OV3  the signs do not hide the hall's portico (S18): in the Financial District and the Global Exchange the LED ticker and the BUYERS board stood on the steps of the hall's portico and drew over its columns (79% and 63% of the portico's face were covered:
//        the board 57% and 38%, the ticker 28% and 29%, measured in the mirrored plan these two districts have, where the board stands on the portico's right in the picture); now neither stands on the steps, the ticker is clear of the portico
//        (2% and 0%) and the board covers a sliver of it (10% and 13%): the hall is 0.6 north and 1.6 east of where it stood and the exchange 0.6 north and 0.9 east (the walk test of tests/world.test.mjs wants the exchange's side
//        on a half-tile line: its east end is 8 tiles from the block's west edge in the picture), the ticker is at the end of the row, 2.8 wide
// What the art draws, as these tests read it (they are held to the drawers' own numbers: a drawer that changes its size changes these):
//   board (street.js): a panel 22 high on posts at z = 18, 36 high, posts 9 px outside 15 px per tile of width; billboard: a panel 18 high at the top of its posts, which stand 22 px per tile of width from the middle; ticker: a body 4 to 4 + h;
//   for-sale post: a post 24 high and a board to its right, 2 to 24 px from the post; lot crate (stock.js): a pallet 0.8 tile by 4 high under a crate 0.72 tile by 17; hall portico (bldg-civic.js hallBody): 0.38 of the hall's width (3.2 tiles at most), 0.8 deep, 4 to h + 1 high, its steps 0.4 beyond.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, DIST } from '../js/world/layout.js';
import { P } from '../js/world/iso.js';

const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** The outline of a box as the camera sees it (six corners: three on the ground, three at the top). z in px, both ends. */
const hexagon = ({ x, y, w, d, z0 = 0, z1 }) => [P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y, z0), P(x + w, y, z1), P(x, y, z1), P(x, y + d, z1)];
const rectOf = (pts) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
const overlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
/** The share of the polygon `face` that lies inside any of the polygons `over`, by points a pixel apart. */
function covered(face, over) {
  const [x0, y0, x1, y1] = rectOf(face); let n = 0, c = 0;
  for (let X = x0 + 0.5; X < x1; X++) for (let Y = y0 + 0.5; Y < y1; Y++) { if (!inPoly([X, Y], face)) continue; n++; if (over.some((o) => inPoly([X, Y], o))) c++; }
  return c / n;
}
/** What a sign draws, in the picture (district-local heights are all alike inside a district, so z is left out). */
function drawn(p) {
  if (p.t === 'board') { const [cx, y] = P(p.gx + p.w / 2, p.gy), hw = p.w * 15; return [cx - hw - 12, y - 40, cx + hw + 12, y + p.d * 16 + 4]; }
  if (p.t === 'billboard') { const [cx, y] = P(p.gx + p.w / 2, p.gy), hw = p.w * 22; return [cx - hw - 3, y - p.h, cx + hw + 3, y + p.d * 16 + 4]; }
  if (p.t === 'ticker') { const l = P(p.gx, p.gy + p.d), r = P(p.gx + p.w, p.gy + p.d); return [l[0], l[1] - 4 - p.h, r[0], r[1] + 4]; }
  if (p.t === 'forsale') { const [x, y] = P(p.gx + 0.2, p.gy); return [x - 4, y - 24, x + 24, y + 4]; }
  return null;
}
const SIGNS = ['board', 'billboard', 'ticker', 'forsale'];

test('OV1: signs do not stand on signs: in no district do two of the signs a kit placed overlap in the picture, and the NEW billboard of Creative Quarter stands clear of the market board', () => {
  const clashes = [];
  for (const id of LAYOUT.ids) {
    const S = DIST[id].props.filter((p) => !p.pad && SIGNS.includes(p.t));
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (overlap(drawn(S[i]), drawn(S[j]))) clashes.push(`district ${id}: ${S[i].t} at ${S[i].gx.toFixed(1)},${S[i].gy.toFixed(1)} and ${S[j].t} at ${S[j].gx.toFixed(1)},${S[j].gy.toFixed(1)}`);
  }
  assert.deepEqual(clashes, []);
  const D = DIST[12], board = D.props.find((p) => p.hot === 'board:12'), nw = D.props.find((p) => p.t === 'billboard' && p.text === 'NEW');
  assert.ok(board && nw, 'Creative Quarter has its market board and its NEW billboard');
  assert.ok(nw.gx >= board.gx + board.w + 0.3 || nw.gx + nw.w <= board.gx - 0.3, 'the billboard is not in front of or behind the board: they are not stacked on the same stretch of the street');
  assert.ok(!overlap(drawn(board), drawn(nw)), 'and the board\'s panel and number are not drawn over (or under) it');
});

test('OV2: the FOR SALE post of Real Estate Row clears the eight lot crates and the depot', () => {
  const D = DIST[15], sign = D.props.find((p) => p.t === 'forsale'), depot = D.props.find((p) => p.hot === 'depot:15');
  assert.ok(sign && depot, 'Real Estate Row has its sign and its depot');
  const box = drawn(sign), spots = D.spots.lots; assert.equal(spots.length, 8);
  const crate = ([gx, gy]) => [hexagon({ x: gx - 0.4, y: gy - 0.4, w: 0.8, d: 0.8, z1: 4 }), hexagon({ x: gx - 0.36, y: gy - 0.36, w: 0.72, d: 0.72, z0: 4, z1: 21 })]; // the lot's crate at its place (the world draws it at the spot's ground height: z is the district's, left out)
  const rect = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  spots.forEach((s, i) => assert.equal(covered(rect, crate(s)), 0, `the post's drawing does not touch lot ${i + 1}'s crate`));
  assert.ok(!(sign.gx < depot.gx + depot.w && sign.gx + sign.w > depot.gx && sign.gy < depot.gy + depot.d && sign.gy + sign.d > depot.gy), 'nor stands on the depot');
  assert.ok(sign.gy + sign.d <= depot.gy - 0.3, 'with a gap of a third of a tile between them');
});

test('OV3: the ticker and the board of the Financial District and the Global Exchange do not stand on the hall\'s portico steps, the ticker is clear of its columns, and the board covers a sliver at most', () => {
  for (const [id, kind] of [[14, 'hall'], [16, 'exchange']]) {
    const D = DIST[id], hall = D.props.find((p) => p.t === kind), ticker = D.props.find((p) => p.t === 'ticker'), board = D.props.find((p) => p.hot === 'board:' + id);
    assert.ok(hall && ticker && board, `district ${id} has its ${kind}, its ticker and its board`);
    const pw = Math.min(hall.w * 0.38, 3.2), px = hall.gx + (hall.w - pw) / 2, yf = hall.gy + hall.d - 0.02 + 0.8, ph = hall.h - 3;
    const steps = { x: px - 0.16, y: yf - 0.02, w: pw + 0.32, d: 0.4 };
    for (const s of [ticker, board]) assert.ok(!(s.gx < steps.x + steps.w && s.gx + s.w > steps.x && s.gy < steps.y + steps.d && s.gy + s.d > steps.y), `district ${id}: the ${s.t} does not stand on the portico's steps`);
    const face = [P(px, yf, 4), P(px + pw, yf, 4), P(px + pw, yf, 4 + ph), P(px, yf, 4 + ph)];
    const signs = { ticker: hexagon({ x: ticker.gx, y: ticker.gy, w: ticker.w, d: ticker.d, z0: 4, z1: 4 + ticker.h }), board: hexagon({ x: board.gx, y: board.gy, w: board.w, d: board.d, z0: 18, z1: 40 }) };
    const t = covered(face, [signs.ticker]), b = covered(face, [signs.board]), both = covered(face, Object.values(signs));
    assert.ok(t <= 0.04, `district ${id}: the ticker covers ${(t * 100).toFixed(0)}% of the portico's columns (it covered 28 and 29%)`);
    assert.ok(b <= 0.14, `district ${id}: the board covers ${(b * 100).toFixed(0)}% of the portico's columns (it covered 57% and 38%)`);
    assert.ok(both <= 0.15, `district ${id}: the signs together cover ${(both * 100).toFixed(0)}% of the portico (they covered 79% and 63%)`);
    assert.ok(ticker.gx >= 0 && D.props.includes(ticker), 'the ticker is still there: it moved, it was not removed');
  }
});
