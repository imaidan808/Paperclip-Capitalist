// Classmates in the world: one flat figure for each of the other students who is playing in a district, standing round that district's home spot, with a small name tag over the head.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). Loaded by World.setPeers with import() when the first figure is given (so a world with no classmates never fetches it) and registers the `peers` layer of stack.js
// when it loads. Nothing here reads the game: the list is what the session's figures() says (the world keeps a checked copy), and a figure's place and look are functions of its pid, so a classmate stands in the same place
// and looks the same on every screen.
//
// What is drawn. A figure is figure.js's flat figure at 1.2 (between a buyer's 1.1 and the player's 1.28) in the look of its pid, facing the home spot, by the same level-of-detail ladder as a buyer (far a pill, mid the body and
// hair, near the face): it idles and blinks with the world's clock (env.t) and stands still, eyes open, when that is 0 (reduced motion). It is an item of the depth-sorted list like a buyer (World.draw calls `queue`; the figure is
// drawn by the layer's drawer), with no hit: a classmate is not a thing to click. At most PEER_CAP figures are drawn in a district (the first by pid) and a quiet "+N more" under the home spot counts the rest.
// A name tag is a chip of the world's own labels (overlay.js, a cached sprite: the alias is canvas text, never markup) over each figure that is near enough to read; the tags are laid out so that none sits on another
// (the figures in front keep theirs, zoomed in they all fit) and fade with the zoom like every added detail. A figure comes in and goes out over FADE_MS (a cut under reduced motion). A district that is still under cloud
// for this player draws none of its classmates.
import { registerLayer, slotFor } from './stack.js';
import { DIST, SPOTS, PLOTS, T, zAt, zoneAt, BW, BD } from './layout.js';
import { P, sx, strHash, h2, clamp } from './iso.js';
import { SKY, METAL } from './palette.js';
import { disc, rr, fade } from './toys.js';
import { drawFigure } from './figure.js';
import { lookV2, poseOf } from './characters.js';
import { qs } from './labels.js';

/** At most this many figures are drawn in a district; the others are counted in a quiet "+N more". */
export const PEER_CAP = 24;
/** A figure comes in, and goes out, over this long (milliseconds of the world's clock). */
export const FADE_MS = 500;

// ---------------------------------------------------------------- where a classmate stands
// The places round a district's home spot: a sunflower of seeds (each a golden angle on from the last, a little further out), nearest first, then every place a figure could not stand left out: off the level plateau or
// within a tile of the block's edge, inside a building or a prop, on a plot, in the stash yard, on a buyer's place, a lot's or the door's, or on the player's own spot. Worked out once for each district.
const GOLDEN = 2.399963229728653, INNER = 2, SPREAD = 0.68, SEEDS = 260, EDGE = 1, CLEAR = 0.45;
const POOLS = new Map();
/** The places a classmate may stand in district `z`, as grid points [gx, gy], nearest the home spot first. At least 30 in every district of the island (tests/world-peers.test.mjs), 1.2 tiles or more apart. */
export function slotsOf(z) {
  let pool = POOLS.get(z); if (pool) return pool;
  pool = [];
  const D = DIST[z], S = SPOTS[z], [hx, hy] = S.home, keepOut = [], spots = [...S.leads.map(([x, y]) => [x, y, 1.1]), ...S.lots.map(([x, y]) => [x, y, 0.9]), [D.door[0], D.door[1], 1.2]];
  for (const p of D.props) if (p.solid) keepOut.push([p.gx - CLEAR, p.gy - CLEAR, p.gx + p.w + CLEAR, p.gy + p.d + CLEAR]);
  for (const [x, y] of PLOTS[z]) keepOut.push([x - CLEAR, y - CLEAR, x + T.PS + CLEAR, y + T.PS + CLEAR]);
  const sr = D.stashRect; keepOut.push([sr[0] - CLEAR, sr[1] - CLEAR, sr[0] + sr[2] + CLEAR, sr[1] + sr[3] + CLEAR]);
  for (let k = 0; k < SEEDS; k++) {
    const r = INNER + SPREAD * Math.sqrt(k), a = k * GOLDEN, gx = hx + r * Math.cos(a), gy = hy + r * Math.sin(a);
    if (gx < D.ox + EDGE || gx > D.ox + BW - EDGE || gy < D.oy + EDGE || gy > D.oy + BD - EDGE || zoneAt(gx, gy) !== z || Math.abs(zAt(gx, gy) - D.z) > 2) continue;
    if (keepOut.some((q) => gx > q[0] && gx < q[2] && gy > q[1] && gy < q[3]) || spots.some((q) => Math.hypot(gx - q[0], gy - q[1]) < q[2])) continue;
    pool.push([gx, gy]);
  }
  POOLS.set(z, pool); return pool;
}
const byPid = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // by code unit, the same on every machine (not by locale)
const byPidOf = (a, b) => byPid(a.pid, b.pid);
/** Where a pid starts looking for a place: a hash of the pid, squared so that the nearer places are asked for more often and a small class gathers round the home spot. */
const startOf = (pid, n) => Math.floor(h2(strHash(pid), 17) ** 2 * n);
/**
 * The places of these classmates in district `z`, as a Map from pid to [gx, gy]: each pid goes to the place its hash asks for, or the next free one along the ring (the pids taken in sorted order, so the answer is the same
 * for the same set in any order). A pid alone always has the same place. When there are more pids than places the rest get none (the layer never asks for more than PEER_CAP).
 */
export function placeIn(z, pids) {
  const pool = slotsOf(z), at = new Map(), taken = new Uint8Array(pool.length);
  if (!pool.length) return at;
  for (const pid of pids.slice().sort(byPid)) {
    if (at.size >= pool.length) break;
    if (at.has(pid)) continue;
    let i = startOf(pid, pool.length); while (taken[i]) i = (i + 1) % pool.length;
    taken[i] = 1; at.set(pid, pool[i]);
  }
  return at;
}

// ---------------------------------------------------------------- what a classmate looks like
/** One look, made from the pid alone: the palette's shirt, hair, skin, trousers, trim and shoes of personLook(strHash(pid)), and a hair style, a garment, legwear and a mark from the lists of figure.js by the same hash, exactly as a buyer's (lookV2 reads the same hash; no role, so no hat and nothing held), and the way the pid faces if nothing says otherwise. */
export function peerLook(pid) {
  const look = lookV2({ id: pid, seg: '' });
  look.dir = h2(strHash(pid), 3) < 0.5 ? 1 : -1;
  return look;
}

// ---------------------------------------------------------------- the people on stage (one record for each figure, one for each district that has some or is still saying "+N more")
// A figure's record r: { type 'peer', key 'district:pid', pid, name, z, look, gx, gy (its place), x, y (the same in world pixels, on the ground), k (its depth key), dir, a (how far in: 0 to 1), da (the strength it is drawn with),
// want (1 while it is in the list, 0 while it fades out), tag (does its tag fit), ov (its tag's entry in the world's overlay) }. A district's record Z: { z, list (its figures, front first), more (how many are not drawn), ma (how far
// in its "+N more" is), text, hx, hy (its home spot in world pixels), ov, rev, zq (what its tags were last laid out for) }. All of it lives on the world (w.peerState): the module keeps nothing of its own.
const stateOf = (w) => w.peerState || (w.peerState = { recs: new Map(), zones: new Map(), last: 0, rev: 0, td: 0 });
function zoneOf(S, z) {
  let Z = S.zones.get(z);
  if (!Z) { const [hx, hy] = SPOTS[z].home, [x, y] = P(hx, hy, zAt(hx, hy)); S.zones.set(z, Z = { z, list: [], more: 0, ma: 0, text: '', hx: x, hy: y, ov: null, rev: -1, zq: -1 }); }
  return Z;
}
/** Put a figure on a place: its ground point and the height of the ground there, its depth key (just in front of a prop on its tile, as a buyer's), and the way it faces: towards the home spot. */
function stand(r, [gx, gy]) {
  const [x, y] = P(gx, gy, zAt(gx, gy)), home = SPOTS[r.z].home, hx = sx(home[0], home[1]);
  r.gx = gx; r.gy = gy; r.x = x; r.y = y; r.k = gx + gy + 0.5;
  if (Math.abs(x - hx) > 1) r.dir = x < hx ? 1 : -1;
  return r;
}
const newRec = (key, p, spot) => { const look = peerLook(p.pid); return stand({ type: 'peer', key, pid: p.pid, name: p.name, z: p.z, look, gx: 0, gy: 0, x: 0, y: 0, k: 0, dir: look.dir, a: 0, da: 0, want: 1, tag: false, ov: null }, spot); };
const front = (a, b) => b.k - a.k || byPid(a.pid, b.pid);

/**
 * Give the layer the world's list ({ pid, name, z } each, as World.setPeers keeps it). The first PEER_CAP of a district by pid are its figures, each on the place its pid asks for (placeIn); a figure that is already on
 * stage stays (and may take a new alias), one that is new comes in, one that is gone fades out, where it stood. A pid in two districts is two figures: the one that moved leaves one and arrives in the other.
 * How fast they come and go is the frame's business (`run`: half a second, and at once when the world's clock stands still).
 */
export function set(w, list) {
  const S = stateOf(w), by = new Map(), keep = new Set();
  if (!S.recs.size && !S.zones.size) S.last = 0;                                              // a clock that starts afresh: the first figure comes in from nothing
  for (const p of list) { if (!p || typeof p.pid !== 'string') continue; let a = by.get(p.z); if (!a) by.set(p.z, a = []); a.push(p); }
  for (const [z, ps] of by) {
    ps.sort(byPidOf);
    const shown = ps.slice(0, PEER_CAP), at = placeIn(z, shown.map((p) => p.pid)), Z = zoneOf(S, z);
    Z.list.length = 0; Z.more = ps.length - shown.length;
    for (const p of shown) {
      const spot = at.get(p.pid); if (!spot) continue;
      const key = z + ':' + p.pid; keep.add(key);
      let r = S.recs.get(key);
      if (!r) S.recs.set(key, r = newRec(key, p, spot)); else { r.name = p.name; r.want = 1; stand(r, spot); }
      Z.list.push(r);
    }
    Z.list.sort(front);
  }
  for (const [key, r] of S.recs) if (!keep.has(key)) r.want = 0;
  for (const [z, Z] of S.zones) if (!by.has(z)) { Z.list.length = 0; Z.more = 0; }
  S.rev++;
}
/** Is there anything on stage (a figure, fading out or not, or a count)? The frame does nothing at all when there is not. */
export const live = (w) => !!(w.peerState && (w.peerState.recs.size || w.peerState.zones.size));

// ---------------------------------------------------------------- the frame
const HEAD = 46, GAP = 3, DROP = 22, TAG_SCALE = 0.85, TAG = SKY.mid, MORE = METAL.steelLight; // the top of the hair, the air between it and the tag, how far under the home spot the count stands, the tag's size against the world's labels, the colors (a cool one, and a quieter)
const RECT = new Float64Array(4 * (PEER_CAP + 2));
// A tag is as wide as its text, and the layout's estimate is 6.7 px a letter: right for Latin, about half what a wide character takes (the CJK scripts, the full-width forms, emoji), which would put a neighbor's tag on top of it.
const WIDE = [[0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd]];
/** How many letters wide a text is: a wide character counts for two. */
export const cells = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += WIDE.some(([a, b]) => c >= a && c <= b) ? 2 : 1; } return n; };
const isOpen = (w, z) => !w.unlocked || w.unlocked.has(z);
/** The scale of a tag from the world's label scale `s` (0.75 to 1.25 with the zoom): a little smaller than the other labels, and never under 0.75, which is 8 px of text. */
const tagScale = (s) => Math.max(0.75, s * TAG_SCALE);
function tagEntry(w, S, r) {
  return r.ov || (r.ov = { k: 'chip', peer: true, lo: 1, n: 0, wx: 0, wy: 0, draw: (g, px, py, s) => { const was = fade(g, r.da * S.td); try { w.chip(g, px, py, r.name, TAG, tagScale(s)); } catch (err) { w.fault(err, 'peer tag'); } g.globalAlpha = was; } });
}
function countEntry(w, S, Z) {
  return Z.ov || (Z.ov = { k: 'chip', peer: true, lo: 1, n: 0, wx: 0, wy: 0, draw: (g, px, py, s) => { const was = fade(g, Z.ma * S.td); try { w.chip(g, px, py, Z.text, MORE, tagScale(s)); } catch (err) { w.fault(err, 'peer tag'); } g.globalAlpha = was; } });
}
/**
 * Lay out one district's tags for this zoom: the count first (it is never left out), then the figures from the front to the back, each tag in its place over the head unless it would sit on one already placed, in which
 * case that figure has none until there is room (zoom in). The sizes are the overlay's own for a chip (6.7 px a letter and 14 over, 18 high, at the tag's scale). Sets each figure's `tag` and its entry's place.
 */
function lay(w, S, Z, zoom, s, zq) {
  const sq = qs(tagScale(s)), h = 18 * sq; let n = 0;
  const fits = (cx, cy, hw) => {
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - h / 2, y1 = cy + h / 2;
    for (let i = 0; i < n; i++) if (x0 < RECT[i * 4 + 2] && x1 > RECT[i * 4] && y0 < RECT[i * 4 + 3] && y1 > RECT[i * 4 + 1]) return false;
    RECT[n * 4] = x0; RECT[n * 4 + 1] = y0; RECT[n * 4 + 2] = x1; RECT[n * 4 + 3] = y1; n++; return true;
  };
  Z.rev = S.rev; Z.zq = zq;
  if (Z.more > 0) { Z.text = `+${Z.more} more`; const o = countEntry(w, S, Z); o.n = Z.text.length; o.wx = Z.hx; o.wy = Z.hy + DROP / zoom; fits(Z.hx * zoom, Z.hy * zoom + DROP, (o.n * 6.7 + 14) * sq / 2); }
  for (const r of Z.list) {
    if (!r.name) { r.tag = false; continue; }
    const len = cells(r.name);
    r.tag = fits(r.x * zoom, r.y * zoom - HEAD * zoom - GAP - h / 2, (len * 6.7 + 14) * sq / 2);
    if (r.tag) { const o = tagEntry(w, S, r); o.n = len; o.wx = r.x; o.wy = r.y - HEAD - (GAP + h / 2) / zoom; }
  }
}
/**
 * One frame of the layer, called by World.draw when the layer is loaded, before the depth-sorted list is sorted: each figure's strength moves towards where it is going (in or out over FADE_MS, at once under reduced motion),
 * a figure that is out is forgotten, and each figure in a district that is in view and open is put in the list for the drawer (and its tag, and the district's count, in the world's overlay). Does nothing when nothing is on stage.
 */
export function queue(w, view, vz) {
  const S = w.peerState; if (!S || (!S.recs.size && !S.zones.size)) return;
  try { run(w, S, view, vz); } catch (err) { w.fault(err, 'peers'); }
}
function run(w, S, view, vz) {
  if (slotFor('peers').impl !== 'v2') return;                                                  // the legacy picture has no classmates
  const env = w.env, calm = !env.t, now = w.t, step = calm ? 1 : S.last ? clamp((now - S.last) / FADE_MS, 0, 1) : 0, zoom = w.cam.z, d = env.lod && env.lod.detail;
  const td = d ? d[2] : 1, tagsOn = !env.far && !env.lite && td > 0.02, s = qs(clamp(zoom, 0.75, 1.25)), zq = Math.round(zoom * 64);
  S.last = now; S.td = td;
  for (const Z of S.zones.values()) {
    const want = Z.more > 0 ? 1 : 0;
    Z.ma = calm ? want : want > Z.ma ? Math.min(1, Z.ma + step) : Math.max(0, Z.ma - step);
    if (!Z.list.length && Z.ma <= 0) { S.zones.delete(Z.z); continue; }
    if (tagsOn && vz.has(Z.z) && isOpen(w, Z.z) && (Z.rev !== S.rev || Z.zq !== zq)) lay(w, S, Z, zoom, s, zq);
  }
  for (const r of S.recs.values()) {
    r.a = calm ? r.want : r.want ? Math.min(1, r.a + step) : Math.max(0, r.a - step);
    if (!r.want && r.a <= 0) { S.recs.delete(r.key); continue; }
    if (!(r.a > 0.004) || !vz.has(r.z) || !isOpen(w, r.z) || r.x < view.x0 || r.x > view.x1 || r.y < view.y0 || r.y > view.y1) continue;
    r.da = r.a * r.a * (3 - 2 * r.a);
    w.push(r.k, 'q', r);
    if (tagsOn && r.tag) w.overlay.push(r.ov);
  }
  if (tagsOn) for (const Z of S.zones.values()) if (Z.ma > 0.004 && Z.ov && vz.has(Z.z) && isOpen(w, Z.z)) w.overlay.push(Z.ov);
  if (!S.recs.size && !S.zones.size) S.last = 0;
}

// ---------------------------------------------------------------- the drawer
const SCALE = 1.2;                                                                             // a classmate is a person like the player (1.28) and not a buyer (1.1)
const K = {}, OPT = { dir: 1, gaze: 0, moving: false, mood: 'neutral', wave: false }, A = { mid: 1, face: 1, fine: 0 };
/** One classmate, in the look of its pid at the detail of the zoom, at the strength `da` its record carries; a pill in the shirt color far away, as a buyer is. Paints nothing it does not put back. */
function drawPeer(ctx, view, env, w, r) {
  const da = r.da; if (!(da > 0.004)) return;
  const was = fade(ctx, da);
  if (env.far) {
    const zoom = w.cam.z, pw = clamp(5 / zoom, 5, 11), ph = clamp(8 / zoom, 8, 19);
    rr(ctx, r.x - pw / 2, r.y - ph, pw, ph, pw / 2, r.look.shirt); disc(ctx, r.x, r.y - ph - pw * 0.2, pw * 0.55, pw * 0.55, r.look.skin);
  } else {
    const dt = env.lod ? env.lod.detail : null; A.mid = dt ? dt[1] : 1; A.face = dt ? dt[2] : 1; A.fine = dt ? dt[3] : 0;
    OPT.dir = r.dir; poseOf(K, r.look, env.t, OPT);
    drawFigure(ctx, r.x, r.y, SCALE, K, A);
  }
  ctx.globalAlpha = was;
}
registerLayer('peers', drawPeer, 'inherit');
