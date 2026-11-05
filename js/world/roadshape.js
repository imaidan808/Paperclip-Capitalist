// The shape of a road: rounding its corners and grading the ground under it. Pure (no drawing, no randomness); js/world/layout.js builds the roads with it. Owner: T1 TERRAIN, COAST AND WATER.
//
// Why. The roads of the island were hand-drawn polylines with sharp corners and the ground under them was whatever the noise and the district plateaus made it. At a corner the painted dashes came out as arrows and a car
// jumped sideways (its lane is a fixed offset from a line that turns in one point), and where a road crossed a cliff the ground stepped by 10 world pixels in half a tile, which reads as a road cut off.
// So every corner is an arc (`fillet`) and the ground along every road is a smooth profile (`gradeProfile`, `gradeRoads`) that follows the land's large shape and none of its steps.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** The tiles over which a branch of a fork rises or falls from the junction's height to its own profile (gradeRoads). */
export const JUNCTION_LEVEL = 4.5;

/**
 * Tidy a hand-drawn polyline: a point that repeats the one before it goes, and so does a point where the road runs out along a line and straight back along it (a spur: a waypoint that overshot a junction by a tile
 * left a stub that the road ran out to and back from; a turn of more than 145 degrees is a fold) and so does a point on a straight run, so that a corner is the end of a whole straight leg. Repeats until nothing changes; the ends are kept. Answers a new array.
 */
export function tidy(pts, eps = 0.05, foldDeg = 35) {
  let out = pts.map((p) => p.slice()), changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length; i++) if (Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]) < eps && out.length > 2) { out.splice(i === out.length - 1 ? i - 1 : i, 1); changed = true; break; }
    if (changed) continue;
    for (let i = 1; i + 1 < out.length; i++) {
      const ax = out[i - 1][0] - out[i][0], ay = out[i - 1][1] - out[i][1], bx = out[i + 1][0] - out[i][0], by = out[i + 1][1] - out[i][1];
      const ang = Math.acos(clamp((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1), -1, 1)); // 0 for a fold
      if (ang < (foldDeg * Math.PI) / 180 || ang > Math.PI - 0.02) { out.splice(i, 1); changed = true; break; } // a fold, or a point on a straight run (it would cut the straight leg short of its corner)
    }
  }
  return out;
}

/**
 * Round every interior corner of the polyline `pts` ([[x, y], ...]) with a circular arc of radius `r` (tiles). The arc is tangent to both legs; a radius too big for the legs is cut to what they allow (half of each
 * leg at most, so two corners never overlap). The ends are kept, a straight run and a fold are left as they are, and `steps` is the number of segments an arc of a right angle gets. Answers a new array.
 */
export function fillet(pts, r, steps = 8) {
  if (pts.length < 3 || !(r > 0)) return pts.map((p) => p.slice());
  const out = [pts[0].slice()];
  for (let i = 1; i + 1 < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) { out.push(p1.slice()); continue; }
    const ang = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)); // the angle between the legs: pi for a straight run
    if (ang > Math.PI - 1e-3 || ang < 1e-3) { out.push(p1.slice()); continue; }
    const half = ang / 2, t = Math.min(r / Math.tan(half), la / 2, lb / 2), rho = t * Math.tan(half); // t: how far from the corner along each leg the arc begins
    const ux = ax / la + bx / lb, uy = ay / la + by / lb, ul = Math.hypot(ux, uy) || 1, d = t / Math.cos(half); // the bisector, and the distance to the arc's centre along it
    const cx = p1[0] + (ux / ul) * d, cy = p1[1] + (uy / ul) * d;
    const sx = p1[0] + (ax / la) * t, sy = p1[1] + (ay / la) * t, ex = p1[0] + (bx / lb) * t, ey = p1[1] + (by / lb) * t;
    const a0 = Math.atan2(sy - cy, sx - cx); let da = Math.atan2(ey - cy, ex - cx) - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(da) / (Math.PI / 2)) * steps));
    out.push([sx, sy]);
    for (let k = 1; k < n; k++) out.push([cx + rho * Math.cos(a0 + (da * k) / n), cy + rho * Math.sin(a0 + (da * k) / n)]);
    out.push([ex, ey]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/**
 * The height of a road along its length, from the natural ground `zs` sampled at even steps: the stretches over water (`wet`) take the straight line between the banks (a bridge deck), the whole is smoothed (a gaussian
 * of `sigma` samples, so the land's large shape stays and its steps go), the two ends are held where they were (a road leaves a district at the district's height) and the slope between neighbours is limited to `slope`
 * a step, or to what the two ends need when they are far apart. Answers a new array.
 */
export function gradeProfile(zs, wet = [], { sigma = 6, slope = 1.3 } = {}) {
  const n = zs.length; if (n < 2) return zs.slice();
  const z = zs.slice(); if (wet.every(Boolean) && wet.length === n) return z;
  for (let i = 0; i < n; i++) if (wet[i]) {
    let a = i - 1; while (a >= 0 && wet[a]) a--; let b = i + 1; while (b < n && wet[b]) b++;
    z[i] = a < 0 ? z[b] : b >= n ? z[a] : z[a] + ((z[b] - z[a]) * (i - a)) / (b - a);
  }
  const k = Math.ceil(sigma * 2.5), w = []; for (let d = -k; d <= k; d++) w.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const sm = z.map((_, i) => { let s = 0, ws = 0; for (let d = -k; d <= k; d++) { const j = i + d; if (j < 0 || j >= n) continue; s += z[j] * w[d + k]; ws += w[d + k]; } return s / ws; });
  const e0 = z[0] - sm[0], e1 = z[n - 1] - sm[n - 1]; for (let i = 0; i < n; i++) sm[i] += e0 + (e1 - e0) * (i / (n - 1)); // the ends are what they were; the correction is carried along the road
  const m = Math.max(slope, (Math.abs(sm[n - 1] - sm[0]) / (n - 1)) * 1.15);
  for (let i = 1; i < n; i++) sm[i] = clamp(sm[i], sm[i - 1] - m, sm[i - 1] + m);
  for (let i = n - 2; i >= 0; i--) sm[i] = clamp(sm[i], sm[i + 1] - m, sm[i + 1] + m);
  return sm;
}

/**
 * Grade the ground under every road: for each edge (not the ferry) the height along it is the smooth profile of `gradeProfile`, and every land vertex of the height field `ZV` (width VW, a vertex a tile apart; FV is
 * the land field, positive on land) near the road is drawn toward the profile at the nearest point of the road: wholly within the road and half a tile of it, and less and less to `reach` tiles out. Water is left
 * alone. Changes `ZV` in place, and gives every edge its `zprof` ({ step, z }: the height along it every `step` tiles). `edges` are { pts, lens, len, w, ferry, stem, ja, jb } (the edge starts, ends at a junction).
 * The stem of a fork (the run from a port to the junction where two roads part) is graded last: the two branches are laid first, so the junction stands at one height for all three, and the stem then runs from the port's height to that
 * one and the ground under it follows it (graded first, the branches' own corridors, which overlap it near the junction, took the ground from under it: 3 pixels off at the stem of 12).
 */
export function gradeRoads(ZV, FV, VW, VH, edges, { step = 0.5, reach = 3.5 } = {}) {
  const at = (A, x, y) => { x = clamp(x, 0, VW - 1.001); y = clamp(y, 0, VH - 1.001); const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j, k = j * VW + i; return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + VW] * (1 - tx) + A[k + VW + 1] * tx) * ty; };
  for (const e of [...edges].sort((a, b) => (a.stem ? 1 : 0) - (b.stem ? 1 : 0))) {
    if (e.ferry) continue;
    const P = e.pts, L = e.lens, len = e.len, hw = e.w / 2, S = [];
    for (let s = 0, i = 1; ; s = Math.min(s + step, len)) { while (i < L.length - 1 && L[i] < s) i++; const a = P[i - 1], b = P[i], l = L[i] - L[i - 1] || 1, k = (s - L[i - 1]) / l; S.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); if (s >= len) break; }
    const zs = S.map(([x, y]) => at(ZV, x, y)), wet = S.map(([x, y]) => at(FV, x, y) <= 0), prof = gradeProfile(zs, wet);
    if (!e.stem) for (const [last, on] of [[false, e.ja], [true, e.jb]]) if (on) { // a branch leaves its junction level: the three roads of a fork share the ground under it for the first tiles, so they share one height there, and their own slopes begin beyond it
      const n = prof.length, z0 = prof[last ? n - 1 : 0];
      for (let i = 0; i < n; i++) { const d = (last ? n - 1 - i : i) * step; if (d < JUNCTION_LEVEL) prof[i] = z0 + (prof[i] - z0) * smooth(d / JUNCTION_LEVEL); }
    }
    e.zprof = { step, z: Float32Array.from(prof) }; // (the road's own height along its length: what the road is drawn at, where the ground at a bank dips to the water)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of S) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const R = hw + reach;
    for (let j = Math.max(0, Math.floor(y0 - R)); j <= Math.min(VH - 1, Math.ceil(y1 + R)); j++) for (let i = Math.max(0, Math.floor(x0 - R)); i <= Math.min(VW - 1, Math.ceil(x1 + R)); i++) {
      const v = j * VW + i; if (FV[v] <= 0) continue;
      let best = 1e9, bk = 0; for (let k = 0; k < S.length; k++) { const d = (S[k][0] - i) ** 2 + (S[k][1] - j) ** 2; if (d < best) { best = d; bk = k; } }
      const d = Math.sqrt(best); if (d > R) continue;
      const wgt = 1 - smooth((d - (hw + 0.5)) / (reach - 0.5)); // 1 on the road and half a tile beyond it, fading to 0 at `reach`
      if (wgt > 0) ZV[v] = Math.max(0.5, ZV[v] + (prof[bk] - ZV[v]) * wgt);
    }
  }
}


// ---------------------------------------------------------------- the apron: where a block's street meets the road beyond it
/**
 * The numbers of an apron (tiles). A block is a stage with a street through it (asphalt 2 wide, a raised kerb bar and a tile of sidewalk each side, the stage's rim and lip across its end) and the road between districts is a plain ribbon
 * (asphalt 1.6 wide in a flat kerb a fifth wide, no sidewalk): at a port the two met in one straight cut across the road, a step in the tone of the asphalt, a step in the width, a kerb that stopped and a sidewalk that stopped. The apron is the
 * `len` tiles of road beyond the block's edge in which they become each other: the asphalt narrows from the street's half width to the road's and takes the road's tone, the kerb stays a fifth wide and flat, the sidewalk tapers to
 * nothing. It also reaches `back` tiles under the block's edge, so the stage's lip and shadow do not cross the street's mouth. `slices` is how many bands a tone step is cut in (no band is wider than a third of a tile).
 */
export const APRON = Object.freeze({ len: 2, back: 0.1, slices: 6, streetHalf: 1, roadHalf: 0.8, kerb: 0.2, walk: 0.8 });
/** The half width of the asphalt `u` tiles beyond the block's edge: the street's up to the edge, the road's at the end of the apron, a smooth step between. */
export const apronHalf = (u, A = APRON) => A.streetHalf + (A.roadHalf - A.streetHalf) * smooth(u / A.len);
/** The width of the sidewalk beyond the kerb `u` tiles beyond the edge: the block's at the edge, none at the end. */
export const apronWalk = (u, A = APRON) => (u <= 0 ? A.walk : A.walk * (1 - smooth(u / A.len)));
/**
 * The pieces of an apron as polygons of [x, y, z] in the grid, from `frame(u)`, which answers the road's middle `u` tiles beyond the block's edge (u from -back to len) as [x, y, nx, ny, z] with the unit normal:
 *   bands   `slices` + 1 of them, painted in order, each from its start to the END of the apron ({ u0, t, kerb: [left, right], asphalt }: the two kerb strips, which run a hair under the asphalt, and the asphalt over them), so a later
 *           band covers the rest of the earlier ones and no hairline of what lies under shows where two meet (the kerb is two strips, not a ribbon under the asphalt: the asphalt is drawn a tenth of a pixel higher and the ribbon's
 *           edge would show along its start); `t` (0 to 1) is the band's colour, how far along the change of tone it is (0: the block's own asphalt, 1: the road's)
 *   walks   the two sidewalk wedges { left, right }: from the block's edge outwards, along the kerb, whole at the edge and none at the end
 */
export function apronPieces(frame, A = APRON) {
  const us = [-A.back, ...Array.from({ length: A.slices + 1 }, (_, i) => (A.len * i) / A.slices)]; // the band edges: under the block's edge, then the slices
  const at = (u, o) => { const f = frame(u); return [f[0] + f[2] * o, f[1] + f[3] * o, f[4]]; };
  const outline = (k) => { // the asphalt from us[k] to the end: its left side out and its right side back, a point at every band edge
    const L = [], R = [];
    for (let i = k; i < us.length; i++) { const h = apronHalf(us[i], A); L.push(at(us[i], -h)); R.push(at(us[i], h)); }
    return [...L, ...R.reverse()];
  };
  const strip = (k, sg) => { // a kerb strip: from a hair inside the asphalt's edge to a kerb beyond it
    const out = [], inn = [];
    for (let i = k; i < us.length; i++) { const h = apronHalf(us[i], A); out.push(at(us[i], sg * (h + A.kerb))); inn.push(at(us[i], sg * (h - 0.08))); }
    return [...out, ...inn.reverse()];
  };
  const bands = []; for (let k = 0; k + 1 < us.length; k++) bands.push({ u0: us[k], t: us[k + 1] <= 0 ? 0 : smooth(us[k + 1] / A.len), kerb: [strip(k, -1), strip(k, 1)], asphalt: outline(k) });
  const side = (sg) => { // the wedge: along the kerb from the edge out, then back along its outer side
    const ws = Array.from({ length: A.slices * 2 + 1 }, (_, i) => (A.len * i) / (A.slices * 2));
    return [...ws.map((u) => at(u, sg * (apronHalf(u, A) + A.kerb - 0.1))), ...ws.map((u) => at(u, sg * (apronHalf(u, A) + A.kerb + apronWalk(u, A)))).reverse()]; // (its inner side a hair under the kerb, which is painted over it)
  };
  return { bands, walks: { left: side(-1), right: side(1) } };
}


// ---------------------------------------------------------------- terminations: where a street that no road leaves comes to an end (the world pass WP12; the kinds are the plan's T1 to T13, docs/ART_DIRECTION.md section 4.7)
/**
 * A block's street runs to its plateau's edge at each of its four ports, and of the island's 64 ports 29 had nothing beyond them (the survey of 2026-11-04). A termination is what stands there instead: a bulb or a roundabout to turn on, a
 * yard against a loading dock, a gate into a compound, a farm gate, a quay, a railed belvedere, a sealed tunnel mouth, a path head or a barrier that says ROAD CLOSED. This module is the pure half: the frame of a port, the rule that picks a kind
 * for a port (`chooseTerm`) and the shape of each kind (`shapeOf`: ground pieces, props, the turn spot a car would use, the room it needs). layout.js derives the island's own ends from it at build time and registers them (LAYOUT.terms,
 * LAYOUT.turnSpots); groundart.js paints the pieces; nothing here draws, reads the layout or spends a random number. Lengths are tiles.
 */
/** The way out of a block at each of its ports (the grid's axes). */
export const OUTWARD = Object.freeze({ W: Object.freeze([-1, 0]), E: Object.freeze([1, 0]), N: Object.freeze([0, -1]), S: Object.freeze([0, 1]) });
/** The frame of a port: origin at the port (the middle of the block's side), u out of the block along the street's axis, v to the right of the way out (the lane side: the same side offsetPoly lays a lane on). */
export function portFrame(side, x, y) { const [ux, uy] = OUTWARD[side]; return { x, y, ux, uy, vx: -uy, vy: ux }; }
/** The grid point at (u, v) of a frame. */
export const framePoint = (f, u, v) => [f.x + f.ux * u + f.vx * v, f.y + f.uy * u + f.vy * v];
/** The axis-aligned grid rectangle that covers u0..u1 by v0..v1 of a frame (a frame's axes are the grid's): { x, y, w, d }. */
export function frameRect(f, u0, u1, v0, v1) { const a = framePoint(f, u0, v0), b = framePoint(f, u1, v1); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), d: Math.abs(b[1] - a[1]) }; }

/** The block's street kept beyond its edge: asphalt 2.0 wide (the block's own), a flat kerb of a fifth, the art 0.1 under the edge so the stage's lip never shows across it (the aprons do the same), a flare of 0.5 tile before a disc. */
export const TERM = Object.freeze({ hw: 1.0, kerb: 0.2, back: 0.1, flare: 0.5 });
/** The judges' limit: a quay only where the ground stands 8 px or less above the water; above that the end is a railed belvedere (or closed). */
export const QUAY_DROP = 8;
/** Water this many tiles beyond a port, or less, decides its end; a flat run under MIN_FLAT is a barrier; a quay needs QUAY_ROOM tiles of flat ground, a belvedere DECK_ROOM. */
export const WATER_END = 5, MIN_FLAT = 1.5, QUAY_ROOM = 2, DECK_ROOM = 2.6;
export const TERM_KINDS = Object.freeze(['bulb', 'roundabout', 'hammer', 'yard', 'plaza', 'gate', 'farm', 'barrier', 'quay', 'belvedere', 'portal', 'head']);
/** What a piece of ground is: groundart.js says the colour of each (the district's own tones, the palette's wood and lawn), tests read the roles. `rail` is a polyline, `post` a point, the rest are polygons. */
export const PIECE_ROLES = Object.freeze(['fringe', 'apron', 'walk', 'curb', 'asph', 'dash', 'lawn', 'plaza', 'slab', 'band', 'bay', 'dirt', 'rut', 'deck', 'deck2', 'rail', 'post', 'sand', 'sandedge', 'rock']);
/** The kinds of static prop a termination may stand: the island's own (lamps, benches, signs, bollards, fences, planters, trees, hay, crates, barrels, a fountain, a statue, flags, a kiosk, topiary, the lookout's bench and telescope) and the new flat ones. */
export const PROP_KINDS = Object.freeze(['lamp', 'bench', 'polesign', 'bollard', 'fence', 'planter', 'tree', 'topiary', 'hay', 'crates', 'barrel', 'fountain', 'statue', 'flag', 'kiosk', 'pillar', 'lookout', 'busstop', 'roadend', 'farmgate', 'trough', 'trailboard', 'portal', 'loaddock', 'dish']);
/** A district's dressing, by theme: what stands round the end of its street (bus loop, service turn, farmyard, garden, compound). */
export const DRESS_OF = Object.freeze({ market: 'bus', campus: 'bus', pawn: 'bus', metro: 'bus', creative: 'bus', realty: 'bus', exchange: 'bus', corporate: 'bus', finance: 'bus', estate: 'garden', scrap: 'yard', auto: 'auto', harbor: 'yard', industrial: 'yard', tech: 'tech', farm: 'farm' });
/** The kinds a theme prefers at the end of its street, in order, by the street: the first that fits is built (a bulb when none does, a barrier when not even that). */
const PREFER = Object.freeze({
  scrap: ['yard', 'hammer'], market: [], campus: ['roundabout'], pawn: [], metro: ['roundabout'], creative: { cross: ['yard'] }, estate: { avenue: ['roundabout'], cross: ['gate'] }, auto: ['hammer'], harbor: ['yard', 'hammer'], industrial: ['yard', 'hammer'],
  tech: ['gate'], farm: { avenue: ['farm'], cross: [] }, corporate: { cross: ['plaza'] }, finance: { cross: ['plaza', 'gate'] }, realty: [], exchange: { cross: ['plaza'] },
});
const prefer = (theme, street) => { const p = PREFER[theme] || []; return Array.isArray(p) ? p : p[street] || []; };

/**
 * The kind of end a port gets. `i` is what the ground and the district say: { side, theme, street ('avenue' or 'cross'), flat (tiles of level ground beyond the port), water (the tile at which the sea begins, or null), drop (px the ground
 * stands above that water), hill (a wall of rock within 4 tiles), path (a footpath leaves here), authored (island.js TERMS: a record { kind, ... } chosen by hand) }; `fits(kind, opt)` says whether the shape of a kind has the room it needs on this ground.
 * First match wins: the authored end; a path head; water within WATER_END tiles (a quay when the drop to it is QUAY_DROP px or less, a railed belvedere above that, a barrier when there is no room for either); a hill wall; no flat run; then the
 * theme's own kinds, then a bulb, then a barrier. Answers { kind, opt, why }.
 */
export function chooseTerm(i, fits = () => true) {
  if (i.authored) return { kind: i.authored.kind, opt: i.authored, why: 'chosen by hand (island.js TERMS)' };
  if (i.path) return { kind: 'head', opt: {}, why: 'a footpath leaves here: the street ends in a path head, the path starts beyond its bollards' };
  if (i.water !== null && i.water !== undefined && i.water <= WATER_END) {
    if (i.drop !== null && i.drop <= QUAY_DROP && i.flat >= QUAY_ROOM) return { kind: 'quay', opt: { water: i.water }, why: `water ${i.water} tiles beyond and the ground only ${Math.round(i.drop)} px above it: a quay` };
    if (i.drop > QUAY_DROP && i.flat >= DECK_ROOM) return { kind: 'belvedere', opt: { water: i.water }, why: `water ${i.water} tiles beyond but ${Math.round(i.drop)} px below: a railed belvedere, not a quay (a quay is ${QUAY_DROP} px or less above the water)` };
    return { kind: 'barrier', opt: {}, why: `water ${i.water} tiles beyond and no room for a quay or a deck: closed` };
  }
  if (i.hill) return { kind: 'barrier', opt: {}, why: 'a wall of rock within 4 tiles and no tunnel made for it: closed' };
  if (i.flat < MIN_FLAT) return { kind: 'barrier', opt: {}, why: `only ${i.flat} tiles of level ground: closed` };
  for (const kind of [...prefer(i.theme, i.street), 'bulb']) { const opt = {}; if (fits(kind, opt)) return { kind, opt, why: kind === 'bulb' ? 'the default end of a street: a turning bulb' : `${/^[aeiou]/.test(i.theme) ? 'an' : 'a'} ${i.theme} district ends its ${i.street} in a ${kind}` }; }
  return { kind: 'barrier', opt: {}, why: 'not even a turning bulb fits: closed' };
}

// ---- the shapes. Points are [u, v] of the port's frame; every polygon is simple.
const B0 = -TERM.back, HWK = TERM.hw + TERM.kerb, TAU = Math.PI * 2;
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const circ = (cu, cv, r, n = 28) => Array.from({ length: n }, (_, i) => [cu + Math.cos((i / n) * TAU) * r, cv + Math.sin((i / n) * TAU) * r]);
/** A rectangle with rounded corners of radius r (a quarter circle of `seg` steps at each corner). */
function rrect(u0, u1, v0, v1, r, seg = 4) {
  r = Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2); const out = [];
  for (const [cu, cv, a0] of [[u1 - r, v0 + r, -Math.PI / 2], [u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI]]) for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (Math.PI / 2); out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]); }
  return out;
}
/** The street of half width `hw` from the block's edge to a disc of radius R about (c, 0): straight to `us`, then a flare that runs tangent to the disc (a trumpet mouth), the disc's centre in the outline so it joins the disc whole. */
function neck(c, R, hw, us = TERM.flare, u0 = B0) {
  const dx = us - c, d = Math.hypot(dx, hw), a = Math.atan2(hw, dx) - Math.acos(Math.min(1, R / d)), tu = c + R * Math.cos(a), tv = R * Math.sin(a);
  return [[u0, -hw], [us, -hw], [tu, -tv], [c, 0], [tu, tv], [us, hw], [u0, hw]];
}
/** A stadium: the street from u0 to u1 of half width hw, ending in a half disc (the end of a closed street is a cap, never a cut). */
function capped(u0, u1, hw, n = 12) { const out = [[u0, -hw]]; for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; out.push([u1 + Math.cos(a) * hw, Math.sin(a) * hw]); } out.push([u0, hw]); return out; }
/** The sidewalk of the block tapering to nothing where the street goes on: a wedge along the kerb on each side (the aprons' do the same over their length). */
const walks = (len = 1.6) => [-1, 1].map((s) => ({ role: 'walk', pts: [[B0, s * HWK], [len, s * HWK], [B0, s * (HWK + 0.8)]] }));
/** Keep the part of a polygon at u >= u0 (Sutherland-Hodgman against one line): a gravel apron never lies over the block it blends into. */
function clipU(pts, u0 = 0) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ia = a[0] >= u0, ib = b[0] >= u0;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (u0 - a[0]) / (b[0] - a[0]); out.push([u0, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const P = (role, pts) => ({ role, pts: role === 'apron' || role === 'fringe' ? clipU(pts) : pts });
/** The gravel an end blends into the ground round it with, in two steps (a fringe half a tile wider, a shade nearer the ground, round the apron proper): a disc, or a rectangle. */
const gravelDisc = (c, r, n = 32) => [P('fringe', circ(c, 0, r + 0.5, n)), P('apron', circ(c, 0, r, n))];
const gravelRect = (u0, u1, v0, v1) => [P('fringe', rrect(u0 - 0.5, u1 + 0.5, v0 - 0.5, v1 + 0.5, 0.7)), P('apron', rrect(u0, u1, v0, v1, 0.5))];
/** A prop of the termination: kind, the middle of its footprint (u, v), its size along u (a) and across it (b), height h, and the kind's own fields in `o`. */
const prop = (t, u, v, a, b, h, o = {}) => ({ t, u, v, a, b, h, o });
const lamp = (u, v) => prop('lamp', u, v, 0.2, 0.2, 32);
const bollard = (u, v, col = '#ffd84d') => prop('bollard', u, v, 0.3, 0.3, 8, { col });
/** Two parking bays (a slab with lines 0.1 wide between them) off one side of a disc: where a building stands near the end, somewhere to leave a car. */
const bays = (c, sg, r) => [P('slab', rect(c - 1.1, c + 1.1, sg * (r - 0.1), sg * (r + 2.2))), ...[-1.1, 0, 1.1].map((du) => P('bay', rect(c + du - 0.05, c + du + 0.05, sg * (r - 0.1), sg * (r + 2.2))))];

/** The dressing of a turning end by theme (`dress`): a bus loop (a shelter, a bench, a BUS sign at the shelter), a service turn, a farmyard, a garden court. (c: the middle of the disc, R: its outer radius, kerb included; `bays`: the -v side keeps its place for parking.) */
function dressing(dress, c, R, bayed) {
  const out = [], side = R + 0.9, far = -side - (bayed ? 1.6 : 0);
  if (dress === 'bus') out.push(prop('busstop', c - 0.5, side + 0.2, 1.8, 0.9, 26), prop('bench', c + 1.2, side + 0.1, 1.0, 0.4, 8), prop('polesign', c + 2.3, side - 0.1, 0.4, 0.4, 44, { col: '#3a8fe0', text: 'BUS' }), lamp(c + 0.2, far), prop('planter', c - 1.9, bayed ? far : -side + 0.1, 0.8, 0.8, 10));
  else if (dress === 'garden') out.push(prop('topiary', c, 0, 0.5, 0.5, 30), prop('bench', c + 1.2, side + 0.1, 1.0, 0.4, 8), prop('bench', c - 1.4, far - 0.1, 1.0, 0.4, 8), lamp(c + 0.2, far), lamp(0.9, HWK + 0.7));
  else if (dress === 'farm') out.push(prop('trough', c + 0.4, side + 0.1, 1.6, 0.6, 8), prop('hay', c - 1.6, side + 0.2, 0.9, 0.9, 14), prop('hay', c + 1.7, far, 0.9, 0.9, 14), prop('hay', c + 2.7, side - 0.2, 0.9, 0.9, 14), lamp(c - 0.6, far), prop('barrel', c - 2.6, side - 0.2, 0.7, 0.7, 22, { color: '#b0493a' }));
  else if (dress === 'tech') out.push(bollard(0.9, HWK + 0.6, '#3ad4e6'), bollard(0.9, -HWK - 0.6, '#3ad4e6'), lamp(c + 0.2, far), prop('bench', c + 1.4, side + 0.1, 1.0, 0.4, 8));
  else out.push(bollard(0.9, HWK + 0.6), bollard(0.9, -HWK - 0.6), prop('crates', c - 0.4, side + 0.3, 1.2, 1.2, 26, { n: 2 }), prop('barrel', c + 1.4, far, 0.7, 0.7, 22, { color: '#4a7f55' }), lamp(c + 0.2, side - 0.1)); // yard, auto
  return out;
}

const SHAPE = {
  /** T2: a turning bulb (a disc of asphalt radius 2.2, a kerb of a fifth, an island for a bus loop) a few tenths of a tile beyond the edge, the street flaring into it. A farmyard's is a disc of beaten earth, a bulb near a building has two parking bays. */
  bulb(o) {
    const R = 2.2, gap = o.gap ?? 0.3, c = gap + R + TERM.kerb, dress = DRESS_OF[o.theme] || 'bus', Ro = R + TERM.kerb, island = dress === 'bus' || dress === 'garden', earth = dress === 'farm', bayed = !!o.bays;
    const pieces = [...gravelDisc(c, Ro + 0.4), ...gravelRect(0, c, -(HWK + 0.4), HWK + 0.4), ...walks()];
    if (earth) pieces.push(P('curb', rect(B0, 1.0, -HWK, HWK)), P('asph', rect(B0, 1.0, -TERM.hw, TERM.hw)), P('dirt', neck(c, Ro, HWK, 0.9)), P('dirt', circ(c, 0, Ro, 32)));
    else pieces.push(P('curb', neck(c, Ro, HWK)), P('curb', circ(c, 0, Ro, 32)), P('asph', neck(c, R, TERM.hw)), P('asph', circ(c, 0, R, 32)));
    if (island) pieces.push(P('curb', circ(c, 0, 0.9, 20)), P('lawn', circ(c, 0, 0.7, 20)));
    if (bayed) pieces.push(...bays(c, -1, Ro));
    const props = dressing(dress, c, Ro, bayed); if (dress === 'bus') props.push(prop('tree', c, 0, 0.5, 0.5, 36, { s: 0.8 }));
    return { pieces, props, turn: { u: c, v: 0, r: R, open: true, ring: island }, foot: [{ u0: B0, u1: c + Ro, v0: -Ro - (bayed ? 2.5 : 1.2), v1: Ro + 1.6 }] };
  },
  /** T1: a roundabout: a ring of asphalt 1.3 to 3.1 round a lawn island of 1.1 (a kerb of a fifth), the street meeting it in a flare, a fountain on the island and a kiosk, benches and lamps round it. */
  roundabout(o) {
    const R = 3.1, gap = o.gap ?? 0.3, Ro = R + TERM.kerb, c = gap + Ro, kn = 1.1;
    const pieces = [...gravelDisc(c, Ro + 0.4, 36), ...gravelRect(0, c, -(HWK + 0.4), HWK + 0.4), ...walks(), P('curb', neck(c, Ro, HWK)), P('curb', circ(c, 0, Ro, 36)), P('asph', neck(c, R, TERM.hw)), P('asph', circ(c, 0, R, 36)), P('curb', circ(c, 0, kn + 0.2, 24)), P('lawn', circ(c, 0, kn, 24))];
    const props = [prop('fountain', c, 0, 1.8, 1.8, 8), prop('kiosk', c + 1.0, Ro + 1.0, 1.1, 1.1, 22, { col: '#5fa8e8', sign: 'CAFE' }), prop('bench', c - 1.8, Ro + 0.6, 1.0, 0.4, 8), prop('bench', c + 0.4, -Ro - 0.6, 1.0, 0.4, 8), lamp(c - 2.6, -Ro - 0.3), lamp(0.9, HWK + 0.6), lamp(c + 2.9, Ro + 0.2), prop('tree', c + 1.4, -Ro - 0.9, 0.5, 0.5, 38, { s: 0.9 })];
    return { pieces, props, turn: { u: c, v: 0, r: 2.2, open: true, ring: true }, foot: [{ u0: B0, u1: c + Ro, v0: -Ro - 1.6, v1: Ro + 2.2 }] };
  },
  /** T5: a yard: the hammerhead as an apron against a loading dock, three bays painted on it. */
  yard(o) { return SHAPE.hammer({ ...o, dock: true }); },
  /** A hammerhead: the street ends in a bar across it that a lorry backs into to turn (industrial, harbor, auto); T5 when `dock` is set: the bar is an apron of concrete against a loading dock whose door is the end of the road. */
  hammer(o) {
    const dock = !!o.dock, dress = DRESS_OF[o.theme] || 'yard', auto = dress === 'auto' && !dock, u1 = dock ? 4.6 : 3.2, hv = dock ? 2.6 : 2.8, u0 = dock ? 1.2 : 1.0, bar = auto ? 'asph' : 'slab';
    const pieces = [...gravelRect(0, u1 + 0.4, -(hv + 0.4), hv + 0.4), ...walks(), P('curb', rect(B0, u0, -HWK, HWK)), P('curb', rrect(u0 - 0.2, u1 + 0.2, -hv - 0.2, hv + 0.2, 0.6)), P('asph', rect(B0, u0 + 0.2, -TERM.hw, TERM.hw)), P(bar, rrect(u0, u1, -hv, hv, 0.5))];
    const props = [bollard(0.7, HWK + 0.6), bollard(0.7, -HWK - 0.6), lamp(u0 + 0.4, hv + 0.5)];
    if (dock) { for (const v of [-1.95, -0.65, 0.65, 1.95]) pieces.push(P('bay', rect(u0 + 0.9, u1 - 0.1, v - 0.05, v + 0.05))); props.push(prop('loaddock', u1 + 0.8, 0, 1.5, 4.8, 24, { acc: '#ffd02e' }), prop('crates', 2.4, -hv - 0.6, 1.2, 1.2, 26, { n: 2 }), prop('barrel', 3.4, hv + 0.5, 0.7, 0.7, 22, { color: '#b0493a' })); }
    else if (auto) { for (const s of [-1, 1]) { pieces.push(P('slab', rect(u0 - 0.2, u0 + 2.0, s * (hv + 0.1), s * (hv + 2.1)))); for (const k of [0, 1, 2]) pieces.push(P('bay', rect(u0 - 0.2 + k * 1.1 - 0.05, u0 - 0.2 + k * 1.1 + 0.05, s > 0 ? hv + 0.1 : -hv - 2.1, s > 0 ? hv + 2.1 : -hv - 0.1))); } props.push(prop('polesign', u1 + 0.5, 0, 0.4, 0.4, 50, { col: '#ff5a47', text: 'AUTO' })); }
    else props.push(prop('crates', 2.0, hv + 0.8, 1.2, 1.2, 26, { n: 2 }), prop('barrel', 3.0, -hv - 0.6, 0.7, 0.7, 22, { color: '#4a7f55' }), prop('barrel', 3.8, -hv - 0.6, 0.7, 0.7, 22, { color: '#b0493a' }), prop('polesign', u1 + 0.5, 0, 0.4, 0.4, 50, { col: o.theme === 'harbor' ? '#2f7bd9' : '#e8962a', text: { harbor: 'DOCKS', industrial: 'PLANT', scrap: 'YARD' }[o.theme] || 'YARD' })); // (a service turn says where it is: a sign at its tip)
    const ext = auto ? hv + 2.4 : hv + 1.2;
    return { pieces, props, door: dock ? { u: u1, v: 0 } : null, turn: { u: (u0 + u1) / 2, v: 0, r: 1.8, open: true }, foot: [{ u0: B0, u1: dock ? u1 + 1.6 : u1 + 0.2, v0: -ext, v1: ext }] };
  },
  /** T4: a gate into a compound: the street goes on as a private drive through a gatehouse (an open boom, a booth) with a fence either side, and ends in a small yard of its own inside; a technology district's holds a dish, an estate's two topiaries. */
  gate(o) {
    const tech = o.theme === 'tech', u1 = 5.2, h = 1.6, fen = tech ? '#d9e6f2' : '#e9e2d0';
    const pieces = [...gravelRect(0, u1, -h - 0.2, h + 0.2), ...walks(1.2), P('curb', rect(B0, 2.2, -HWK, HWK)), P('curb', rrect(1.8, u1 + 0.2, -h - 0.2, h + 0.2, 1.0)), P('asph', rect(B0, 2.2, -TERM.hw, TERM.hw)), P('asph', rrect(2.0, u1, -h, h, 0.9))];
    const props = [prop('roadend', 1.0, 0, 0.3, 0.3, 34, { open: 1, plate: tech ? 'STAFF ONLY' : 'PRIVATE' }), prop('fence', 1.0, 3.0, 0.1, 2.0, 18, { along: 'v', col: fen }), prop('fence', 1.0, -3.0, 0.1, 2.0, 18, { along: 'v', col: fen }), lamp(1.7, HWK + 0.6), lamp(u1 - 0.7, -h - 0.7)];
    if (tech) props.push(prop('dish', u1 - 1.2, h + 1.0, 1.2, 1.2, 36, { acc: '#22d9ee', col: '#c9d6e4' })); else props.push(prop('topiary', u1 - 0.8, h + 0.7, 0.5, 0.5, 30), prop('topiary', u1 - 0.8, -h - 0.7, 0.5, 0.5, 30));
    return { pieces, props, turn: { u: 3.6, v: 0, r: 1.5, open: true }, foot: [{ u0: B0, u1: u1 + 0.4, v0: -h - 1.2, v1: h + 1.2 }, { u0: 0.6, u1: 1.4, v0: -4.2, v1: 4.2 }] };
  },
  /** T4 (a farm's): the tarmac gives way to a farm track that ends at a field gate, a trough and hay beside it. */
  farm() {
    const pieces = [...gravelRect(0, 4.6, -1.9, 1.9), ...walks(1.2), P('curb', rect(B0, 1.0, -HWK, HWK)), P('asph', rect(B0, 1.0, -TERM.hw, TERM.hw)), P('dirt', rect(0.9, 4.2, -0.9, 0.9)), P('rut', rect(1.0, 4.1, -0.5, -0.32)), P('rut', rect(1.0, 4.1, 0.32, 0.5))];
    const props = [prop('farmgate', 4.2, 0, 0.3, 2.6, 22), prop('trough', 3.0, 1.9, 1.6, 0.6, 8), prop('hay', 2.0, -1.9, 0.9, 0.9, 14), prop('hay', 3.0, -2.0, 0.9, 0.9, 14), prop('fence', 4.3, 2.6, 0.1, 2.6, 18, { along: 'v', col: '#8a6a45' }), prop('fence', 4.3, -2.6, 0.1, 2.6, 18, { along: 'v', col: '#8a6a45' }), lamp(0.9, HWK + 0.6)];
    return { pieces, props, turn: { u: 2.6, v: 0, r: 1.0, open: true }, foot: [{ u0: B0, u1: 4.6, v0: -3.4, v1: 3.4 }] };
  },
  /** T3: a closed street: it runs a little way past the edge, ends in a round cap (a kerb of a fifth all round, never a cut) and a striped boom across it says ROAD CLOSED, with cones, a lamp and a run of pickets beyond. */
  barrier() {
    const pieces = [...gravelDisc(1.4, 1.9), ...gravelRect(0, 1.4, -1.9, 1.9), ...walks(1.2), P('curb', capped(B0, 1.4, HWK)), P('asph', capped(B0, 1.4, TERM.hw))];
    const props = [prop('roadend', 0.7, 0, 0.3, 0.3, 34, { plate: 'ROAD CLOSED' }), prop('fence', 3.0, 0, 0.1, 5.0, 18, { along: 'v', col: '#e9e2d0' }), lamp(0.8, HWK + 0.6), lamp(0.8, -HWK - 0.6)];
    return { pieces, props, turn: { u: 0.5, v: 0, r: 0, open: false }, foot: [{ u0: B0, u1: 3.4, v0: -3.0, v1: 3.0 }] };
  },
  /** T7: a quay (or, with `ramp`, a slipway): the street goes on as a slab 3.0 wide to 0.4 tile short of the water, a band of cobbles at its edge, bollards along both sides. */
  quay(o) {
    const wet = o.water ?? 4.8, L = o.ramp ? Math.max(2.6, wet - 0.15) : Math.min(4.0, Math.max(2.6, wet - 0.4)), hs = 1.5, slabOf = (g) => [[B0, -HWK - g], [0.3, -HWK - g], [0.9, -hs - g], [L + g, -hs - g], [L + g, hs + g], [0.9, hs + g], [0.3, HWK + g], [B0, HWK + g]];
    const pieces = [...gravelRect(0, L + 0.2, -hs - 0.3, hs + 0.3), ...walks(1.2), P('curb', slabOf(0.15)), P('slab', slabOf(0)), P('band', rect(L - 0.3, L, -hs, hs))];
    if (o.ramp) for (let k = 1; k <= 4; k++) pieces.push(P('bay', rect(1.0 + (k * (L - 1.5)) / 5 - 0.05, 1.0 + (k * (L - 1.5)) / 5 + 0.05, -hs + 0.2, hs - 0.2)));
    const props = [bollard(1.2, -hs - 0.1), bollard(1.2, hs + 0.1), bollard(L - 0.7, -hs - 0.1), bollard(L - 0.7, hs + 0.1), lamp(0.8, HWK + 1.0), prop('crates', 2.2, -hs - 0.9, 1.2, 1.2, 26, { n: 2 })];
    return { pieces, props, turn: { u: Math.max(1.4, L - 1.4), v: 0, r: 1.3, open: true }, foot: [{ u0: B0, u1: L + 0.4, v0: -hs - 1.6, v1: hs + 1.6 }] };
  },
  /** T11: a railed belvedere at the end of a street that stands above the sea: the street goes on as a short deck of planks with a rail on three sides, a bench and a telescope on it, flags and planters at the corners. */
  belvedere(o) {
    const u0 = 0.8, u1 = Math.max(2.6, Math.min(3.6, (o.water ?? 4.6) - 0.9)), h = 1.8, pieces = [...gravelRect(0, u1 + 0.1, -h - 0.2, h + 0.2), ...walks(1.2), P('curb', rect(B0, u0, -HWK, HWK)), P('asph', rect(B0, u0, -TERM.hw, TERM.hw)), P('curb', rect(u0 - 0.1, u1 + 0.15, -h - 0.15, h + 0.15)), P('deck', rect(u0, u1, -h, h))];
    for (let k = 1; k < 8; k += 2) pieces.push(P('deck2', rect(u0, u1, -h + k * 0.45, -h + (k + 1) * 0.45))); // (planks run along the street, in two tones)
    const rail = [P('rail', [[u0 + 0.2, -h + 0.06], [u1 - 0.06, -h + 0.06], [u1 - 0.06, h - 0.06], [u0 + 0.2, h - 0.06]])];
    for (const [pu, pv] of [[u0 + 0.2, -h + 0.06], [u0 + 0.2, h - 0.06], [u1 - 0.06, -h + 0.06], [u1 - 0.06, h - 0.06], [(u0 + u1) / 2, -h + 0.06], [(u0 + u1) / 2, h - 0.06], [u1 - 0.06, 0]]) rail.push(P('post', [[pu, pv]]));
    const props = [prop('lookout', u1 - 0.9, -h + 0.9, 0.8, 0.8, 14), prop('planter', u0 + 0.5, -h - 0.7, 0.8, 0.8, 10), prop('planter', u0 + 0.5, h + 0.7, 0.8, 0.8, 10), lamp(u0 + 0.4, h + 1.4), prop('flag', u1 - 0.3, -h - 0.4, 0.2, 0.2, 44, { col: '#ff7fb8' })];
    return { pieces: [...pieces, ...rail], props, turn: { u: 2.2, v: 0, r: 1.2, open: true }, foot: [{ u0: B0, u1: u1 + 0.4, v0: -h - 1.2, v1: h + 1.2 }] };
  },
  /** T8, sealed: the street ends 1.8 tiles out against a face of rock with an arch boarded across it, a CLOSED sign and two cones. */
  portal() {
    const pieces = [...gravelRect(0, 2.9, -2.4, 2.4), ...walks(1.2), P('curb', rect(B0, 1.9, -HWK, HWK)), P('asph', rect(B0, 1.9, -TERM.hw, TERM.hw))];
    const props = [prop('portal', 2.35, 0, 0.9, 3.4, 52), lamp(0.9, HWK + 0.6), bollard(0.9, -HWK - 0.5, '#ff9a3a')];
    return { pieces, props, turn: { u: 1.0, v: 0, r: 0, open: false }, foot: [{ u0: B0, u1: 3.0, v0: -2.8, v1: 2.8 }] };
  },
  /** T10: a path head: the street ends in a round cap and the path begins at two bollards one tile apart, over a strip of dropped kerb 0.6 deep, a trailhead board and a bench beside it. */
  head() {
    const u1 = 0.6, pieces = [...gravelDisc(u1, 1.5, 24), ...walks(1.2), P('curb', capped(B0, u1, HWK)), P('asph', capped(B0, u1, TERM.hw)), P('sandedge', rect(u1 + 0.4, u1 + 1.1, -0.62, 0.62)), P('sand', rect(u1 + 0.5, u1 + 1.1, -0.5, 0.5))];
    const props = [bollard(u1 + 0.2, -0.5, '#ffd84d'), bollard(u1 + 0.2, 0.5, '#ffd84d'), prop('trailboard', u1 + 0.3, 1.9, 0.4, 1.3, 30), prop('bench', u1 + 0.2, -1.9, 0.4, 1.0, 8)];
    return { pieces, props, turn: { u: 0.4, v: 0, r: 0, open: false }, foot: [{ u0: B0, u1: u1 + 1.4, v0: -2.6, v1: 2.6 }] };
  },
  /** T6: a plaza: a paved square with its corners cut, a one-way drive round an island (a fountain), bollards round the edge, the street entering it. */
  plaza() {
    const c = 3.7, pieces = [P('fringe', rrect(-0.5, 7.9, -4.2, 4.2, 1.4, 2)), P('plaza', rrect(0, 7.4, -3.7, 3.7, 1.2, 2)), ...walks(), P('curb', rect(B0, 1.3, -HWK, HWK)), P('asph', rect(B0, 1.3, -TERM.hw, TERM.hw)), P('curb', rrect(c - 2.8, c + 2.8, -2.8, 2.8, 1.1)), P('asph', rrect(c - 2.6, c + 2.6, -2.6, 2.6, 1.0)), P('curb', rrect(c - 1.2, c + 1.2, -1.2, 1.2, 0.5)), P('lawn', rrect(c - 1.0, c + 1.0, -1.0, 1.0, 0.4))];
    const props = [prop('fountain', c, 0, 1.8, 1.8, 8)]; for (const [u, v] of [[0.7, -3.1], [0.7, 3.1], [3.7, -3.4], [3.7, 3.4], [6.8, -3.1], [6.8, 3.1], [6.9, 0]]) props.push(bollard(u, v, '#fffaf0')); props.push(prop('flag', 6.4, -2.2, 0.2, 0.2, 44, { col: '#3f8fe0' }), prop('flag', 6.4, 2.2, 0.2, 0.2, 44, { col: '#3f8fe0' }), lamp(1.2, 3.0), lamp(1.2, -3.0));
    return { pieces, props, turn: { u: c, v: 0, r: 2.2, open: true, ring: true }, foot: [{ u0: B0, u1: 7.6, v0: -3.9, v1: 3.9 }] };
  },
};
/**
 * The shape of a termination of `kind` in the frame of its port: { kind, pieces: [{ role, pts }] (ground, painted in order), props: [{ t, u, v, a, b, h, o }] (the dressing), turn: { u, v, r, open, ring } (the spot a car turns round on:
 * `open` false for a closed end, where the last drivable point is all there is), foot: [{ u0, u1, v0, v1 }] (the room it needs, rectangles of the frame), door ({ u, v }: the door of a loading dock, at the end of the road) }.
 * `o`: { theme, side, water, ramp, gap, dock, bays }.
 */
export function shapeOf(kind, o = {}) {
  const make = SHAPE[kind]; if (!make) throw new RangeError('no termination of kind ' + kind);
  const s = make(kind === 'hammer' && o.dock === undefined ? { ...o, dock: false } : o);
  const ur = o.rail && o.flat !== undefined ? railAt(kind, s, o.flat, true) : null;
  if (ur !== null) { // the plateau falls away just beyond the end: a rail across it, with a post at each end and in the middle (a street that turns round on a cliff top is railed)
    const h = 1.8; s.pieces = [...s.pieces, P('rail', [[ur, -h], [ur, h]]), ...[[ur, -h], [ur, 0], [ur, h]].map((q) => P('post', [q]))]; s.foot = [...s.foot, { u0: ur - 0.1, u1: ur + 0.1, v0: -h - 0.1, v1: h + 0.1 }];
  }
  return { kind, door: null, ...s };
}
/**
 * Where a rail belongs across the far side of an end of this kind (the u of it), or null: the ground falls away within 1.6 tiles of where the end's room stops and there is a quarter tile of level ground left beyond the end to stand it on. A belvedere, a quay, a portal, a path
 * head, a yard (the dock closes it) and a barrier (its pickets) have their own.
 */
export function railAt(kind, shape, flat, fall) {
  if (!fall || ['belvedere', 'quay', 'portal', 'head', 'yard', 'barrier'].includes(kind)) return null;
  const far = Math.max(...shape.foot.map((r) => r.u1)), ur = far + 0.25; return flat - far < 1.6 && ur <= flat - 0.2 ? ur : null;
}
export const wantsRail = (kind, shape, flat, fall) => railAt(kind, shape, flat, fall) !== null;

/**
 * A path head beside a road (island.js HEADS): the frame has its origin on the road's middle line, u towards the path along its first stretch, v to the right. The footpath's own sand runs from the road's middle line to its head, 2.0 out (groundart.js headConnectors);
 * this adds the dropped kerb (a strip of paving 0.6 deep and 1.0 wide laid over the road's kerb, in a darker sand edge) and at the head two bollards one tile apart across the path, a trailhead board and a bench beside it.
 */
export function headShape() {
  const pieces = [P('sandedge', rect(0.74, 1.46, -0.62, 0.62)), P('sand', rect(0.8, 1.4, -0.5, 0.5))];
  const props = [bollard(1.75, -0.5), bollard(1.75, 0.5), prop('trailboard', 1.9, 1.7, 0.4, 1.3, 30), prop('bench', 1.9, -1.6, 0.4, 1.0, 8)];
  return { kind: 'sidehead', pieces, props, turn: null, foot: [{ u0: 0.7, u1: 3.7, v0: -2.2, v1: 2.4 }], door: null };
}

/**
 * The deck of a lookout (T11): a square of 2 by 2 tiles about the end of its footpath, planks in two tones that run the way the path comes in, a rail on the three sides it does not come in by with a post at every corner and every middle. `inSide` is the side of the
 * deck the path arrives at ('W', 'E', 'N' or 'S'); `zAt(x, y)` gives the ground's height. Pieces in the grid, points [x, y, z]: { rect: [x, y, w, d], pieces: [{ role, pts }] } (roles deck, deck2, rail, post).
 */
export function deckOf(cx, cy, inSide, zAt) {
  const z = (x, y) => [x, y, zAt(x, y) + 0.4], x0 = cx - 1, x1 = cx + 1, y0 = cy - 1, y1 = cy + 1, alongX = inSide === 'W' || inSide === 'E', pieces = [{ role: 'deck', pts: [z(x0, y0), z(x1, y0), z(x1, y1), z(x0, y1)] }];
  for (let k = 1; k < 4; k += 2) pieces.push({ role: 'deck2', pts: alongX ? [z(x0, y0 + k * 0.5), z(x1, y0 + k * 0.5), z(x1, y0 + (k + 1) * 0.5), z(x0, y0 + (k + 1) * 0.5)] : [z(x0 + k * 0.5, y0), z(x0 + (k + 1) * 0.5, y0), z(x0 + (k + 1) * 0.5, y1), z(x0 + k * 0.5, y1)] });
  const e = 0.07, a = x0 + e, b = x1 - e, c = y0 + e, d = y1 - e, rail = { W: [[x0 + 0.2, c], [b, c], [b, d], [x0 + 0.2, d]], E: [[x1 - 0.2, c], [a, c], [a, d], [x1 - 0.2, d]], N: [[a, y0 + 0.2], [a, d], [b, d], [b, y0 + 0.2]], S: [[a, y1 - 0.2], [a, c], [b, c], [b, y1 - 0.2]] }[inSide];
  pieces.push({ role: 'rail', pts: rail.map(([x, y]) => z(x, y)) });
  for (let i = 0; i < rail.length; i++) { pieces.push({ role: 'post', pts: [z(...rail[i])] }); if (i + 1 < rail.length) pieces.push({ role: 'post', pts: [z((rail[i][0] + rail[i + 1][0]) / 2, (rail[i][1] + rail[i + 1][1]) / 2)] }); }
  return { rect: [x0, y0, 2, 2], pieces };
}
