// The hand-authored geography of the island: where each of the sixteen districts stands, how big it sprawls, how high it sits, how the roads join them,
// and what cuts a locked one off. Pure data (no drawing, no randomness); layout.js turns it into terrain, roads and props.
// Grid: x grows to the lower right on screen, y to the lower left, so the journey runs from the muddy lowland at the bottom left (district 1),
// round the south and east, up the north shore and across a high plateau to the Global Exchange on its own islet at the top right.
export const GW = 190, GH = 140;
export const BW = 22, BD = 18;                     // the core block every district is built on (stash yard, plots, lots, HQ, depot, board, landmarks)

/** cx, cy: centre of the core block (where its avenue and cross street meet). z: plateau height in px. pad: extra ground [west, north, east, south] around the block.
 *  gate: what cuts the district off while locked (barrier, bridge, ferry, or just fog). flip: mirror the plan east-west. */
export const ANCHORS = {
  1: { cx: 22, cy: 114, flip: false, z: 3, pad: [0, 0, 0, 0], gate: 'fog' },
  2: { cx: 52, cy: 121, flip: true, z: 6, pad: [4, 0, 3, 2], gate: 'barrier' },
  3: { cx: 87, cy: 112, flip: true, z: 10, pad: [4, 5, 6, 3], gate: 'barrier' },
  4: { cx: 56, cy: 94, flip: false, z: 15, pad: [0, 3, 2, 0], gate: 'barrier' },
  5: { cx: 126, cy: 100, flip: true, z: 24, pad: [5, 6, 5, 4], gate: 'bridge' },
  6: { cx: 168, cy: 96, flip: false, z: 31, pad: [10, 6, 4, 6], gate: 'barrier' },
  7: { cx: 140, cy: 68, flip: false, z: 37, pad: [3, 0, 2, 2], gate: 'barrier' },
  8: { cx: 172, cy: 52, flip: true, z: 18, pad: [4, 2, 3, 8], gate: 'barrier' },
  9: { cx: 116, cy: 46, flip: true, z: 46, pad: [6, 6, 5, 4], gate: 'bridge' },
  10: { cx: 84, cy: 40, flip: false, z: 54, pad: [4, 4, 4, 5], gate: 'barrier' },
  11: { cx: 44, cy: 56, flip: true, z: 49, pad: [10, 12, 6, 8], gate: 'fog' },
  12: { cx: 18, cy: 84, flip: false, z: 61, pad: [4, 2, 8, 5], gate: 'barrier' },
  13: { cx: 50, cy: 22, flip: false, z: 84, pad: [3, 7, 2, 4], gate: 'barrier' },
  14: { cx: 90, cy: 12, flip: true, z: 94, pad: [3, 3, 2, 2], gate: 'barrier' },
  15: { cx: 122, cy: 14, flip: false, z: 88, pad: [8, 4, 2, 5], gate: 'fog' },
  16: { cx: 170, cy: 18, flip: true, z: 70, pad: [2, 6, 6, 2], gate: 'ferry' },
};

/** The four regions of the journey (starter streets, city and harbor, industry and countryside, the capital). */
export const REGIONS = [
  { id: 'A', name: 'Starter streets', ids: [1, 2, 3, 4], tint: '#8a6a3a' },
  { id: 'B', name: 'City and harbor', ids: [5, 6, 7, 8], tint: '#4a7aa8' },
  { id: 'C', name: 'Industry and countryside', ids: [9, 10, 11, 12], tint: '#7a9a4a' },
  { id: 'D', name: 'The capital', ids: [13, 14, 15, 16], tint: '#c9b878' },
];

/** Extra land: [cx, cy, rx, ry] ellipses (peninsulas, headlands, off-shore islets). Land around districts and roads is added by layout.js. */
export const BLOBS = [[8, 128, 14, 8], [182, 98, 10, 14], [8, 6, 7, 4], [182, 128, 5, 4], [100, 136, 8, 4], [178, 66, 7, 5], [140, 134, 6, 3], [10, 40, 8, 10], [112, 76, 10, 8], [4, 98, 4, 3]];
/** Water cut out of the land: ellipses [cx, cy, rx, ry] (lake, bays, the strait) and rivers { pts, r } (a river runs from the lake to the sea; an inlet from the north shore). */
export const CARVES = {
  ellipses: [[92, 71, 20, 12], [38, 139, 13, 8], [104, 0, 12, 7], [141, 14, 7, 17], [2, 56, 8, 14], [186, 120, 8, 12], [150, 140, 14, 6], [172, 34, 20, 3.5]],
  rivers: [{ pts: [[92, 71], [96, 78], [100, 90], [106, 102], [108, 116], [110, 128], [112, 142]], r: 4.5 }, { pts: [[143, -2], [143, 14], [145, 28], [143, 45]], r: 4.2 }],
};

/** Roads between districts. a and b are ports ('5.W' = the west end of district 5's avenue; W E on the avenue, N S on the cross street), junction names (JUNCTIONS) or, for a footpath, a path head (HEADS) and a lookout (VIEWPOINTS).
 *  via: waypoints the road bends through (otherwise it bends once, halfway). gate: the district that opens it. path: a narrow footpath. ferry: a water crossing. stem: the run from a port to the fork where two roads part (it carries no car of its own).
 *  A road that leaves a port runs straight out of it for three tiles (layout.js); one that leaves a junction, or a path head, starts where it stands. */
export const ROADS = [
  { a: '1.E', b: '2.W', gate: 2, via: [[38, 114], [38, 122]] },
  { a: '2.N', b: '4.S', gate: 4, via: [] },
  { a: '2.E', b: '3.W', gate: 3, via: [[70, 122], [70, 112]] },
  { a: '4.E', b: 'j4', gate: 4, via: [], stem: true },
  { a: 'j4', b: '3.N', gate: 4, via: [] },
  { a: '3.E', b: '5.S', gate: 5, via: [[104, 112], [126, 112]] },
  { a: '5.E', b: '6.W', gate: 6, via: [[146, 100], [150, 96]] },
  { a: '5.N', b: '7.S', gate: 7, via: [[126, 84], [140, 84]] },
  { a: '6.N', b: '7.E', gate: 7, via: [[168, 70], [158, 68]] },
  { a: '8.W', b: 'j8', gate: 8, via: [], stem: true },
  { a: '7.N', b: 'j8', gate: 8, via: [[140, 55], [152, 55]] },
  { a: 'j8', b: '9.E', gate: 9, via: [[152, 50], [135, 46]] },
  { a: '9.W', b: '10.E', gate: 10, via: [[102, 46], [100, 40]] },
  { a: '10.W', b: '11.E', gate: 11, via: [[64, 40], [60, 50]] },
  { a: '12.N', b: 'j12', gate: 12, via: [], stem: true },
  { a: '11.S', b: 'j12', gate: 12, via: [[44, 70]] },
  { a: 'j12', b: '13.S', gate: 13, via: [[12, 70], [12, 34], [50, 34]] },
  { a: '13.E', b: '14.W', gate: 14, via: [[66, 22], [66, 14], [72, 14]] },
  { a: '14.E', b: '15.W', gate: 15, via: [] },
  { a: '10.N', b: '14.S', gate: 14, via: [[84, 28], [86, 28]] },
  { a: 'j4', b: '5.W', gate: 5, via: [[78, 92], [88, 92], [98, 96], [112, 100]] },
  { a: '15.E', b: '16.W', gate: 16, via: [[136, 14], [146, 16]], ferry: true },
  // footpaths to the lookouts (three of them leave a road from a path head, 2 tiles to its side)
  { a: 'h1', b: 'v1', gate: 10, via: [[66, 46], [70, 58]], path: true },
  { a: 'h2', b: 'v2', gate: 5, via: [[102, 118], [98, 124]], path: true },
  { a: '9.S', b: 'v3', gate: 9, via: [[116, 64]], path: true },
  { a: '12.E', b: 'v4', gate: 12, via: [[40, 84], [44, 76]], path: true },
  { a: '14.N', b: 'v5', gate: 14, via: [], path: true },
  { a: 'h6', b: 'v6', gate: 4, via: [[74, 88]], path: true },
];
/**
 * Where a road forks: a junction is a node three tiles or more out on the stem the two roads share. A stem runs from the port to it, each of the two branches runs from it to the port it was drawn to. `port` is the stem's port
 * and `at` the node (on the street's axis): layout.js and the road layer read them, and a gate stands where the road in is ten tiles from the port, so the stem counts in that length.
 */
export const JUNCTIONS = { j4: { at: [72, 94], port: '4.E' }, j8: { at: [156, 52], port: '8.W' }, j12: { at: [18, 70], port: '12.N' } };
/** Where a footpath leaves a road: a path head, two tiles to the side of the road's middle line (so the path never lies on the asphalt: a path keeps 1.5 tiles from every road's middle line but within 2 of its head). `port` is the stem or road it stands beside. */
export const HEADS = { h1: { at: [69, 42], port: '10.W' }, h2: { at: [101, 114], port: '3.E' }, h6: { at: [70, 92], port: '4.E' } };
/**
 * How a street that no road leaves ends, where it is chosen by hand (the rest are derived at build time from the ground and the district's theme: roadshape.js chooseTerm; layout.js registers them as LAYOUT.terms). A record is { kind, ...options }:
 * a barrier (the street is closed and says so), a quay (water 8 px or less below the ground; `ramp`: a slipway into it) and a sealed tunnel mouth (the mouth of the hill north of the scrap yard, made for the link to the Creative Quarter that the island does not build yet).
 * Paths heads need no record: a footpath that leaves a port makes one. 1.W is a boat slipway and 1.S a quay: the yard stands on a point of land with the sea on two sides; 4.W faces a gully, and 8.N a cliff over the strait.
 */
export const TERMS = {
  '1.W': { kind: 'quay', ramp: true },
  '1.S': { kind: 'quay' },
  '1.N': { kind: 'portal' },
  '4.W': { kind: 'barrier' },
  '8.N': { kind: 'barrier' },
};
/** Lookouts at the ends of the footpaths: a bench, a telescope and a view. */
export const VIEWPOINTS = { v1: [72, 60], v2: [98, 127], v3: [113.5, 65], v4: [48, 72], v5: [90, 1.2], v6: [76, 84] };
