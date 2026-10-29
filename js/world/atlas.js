// A small sprite atlas for things that come in variants and stand in many places: the trees of one species, a crate of one colour, a doll of one look. One drawing is baked once at the scale it is
// shown at and blitted 1:1 on whole device pixels wherever that variant stands, so a forest of two hundred trees is two hundred copies of a handful of bitmaps and not two hundred drawings.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). The T5 sprite cache (sprites.js) caches one sprite per prop at the prop's own place; this is its sibling for variants, anchored at a foot point
// and keyed by a name, never by a prop. It follows the same pixel rules (docs/RENDER_PLAN.md section 5): a sprite is built at the exact device scale of the view (rounded to 1/1024 octave), so the blit is a straight
// copy; while the zoom moves nothing is built and the sprite of the scale before stands in, scaled (never more than the ratio below); a build is a few milliseconds a frame at most; the pixels are
// counted in the ledger ('props.atlas') and given back by the releaser; with no OffscreenCanvas (the Node tests) every call draws directly, which is the same picture.
import { ledger, registerReleaser, surface } from './gfx.js';
import { registerProp } from './stack.js';
import { P } from './iso.js';
import { vseed } from './toys.js';

const ZOOM_STEPS = 1024, REUSE_MIN = 0.78, REUSE_MAX = 1.28, MOVING_MS = 90, BUILD_MS = 3, GAP_MS = 6, MAX_PX = 1.6e6, KEEP_MS = 400;
export const ATLAS_BUDGET = 8e6;                // pixels the atlas may hold at any density (28 MB of 4-byte pixels); the least recently used go first
const MAP = new Map();                            // key -> { list: [entry] }
const ALL = new Set();
export const stats = { builds: 0, hits: 0, direct: 0, stale: 0, evicted: 0, pixels: 0 };
let tick = 0, lastA = 0, changedAt = 0, winAt = -1e9, lastCall = -1e9, spent = 0, enabled = true, budget = ATLAS_BUDGET;

const canUse = () => typeof OffscreenCanvas !== 'undefined';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function drop(e) { if (ALL.delete(e)) { stats.pixels -= e.w * e.h; ledger.register('props.atlas', stats.pixels * 4); } try { if (typeof e.img.close === 'function') e.img.close(); else { e.img.width = 0; e.img.height = 0; } } catch { /* already gone */ } }
/** Evict the least recently used sprites down to 85% of the budget, but never one drawn in the last KEEP_MS: a view whose working set is bigger than the budget must keep what it is showing and draw the rest directly, not rebuild the same sprites every frame (LRU's worst case). */
function trim(keep, t) { for (const e of [...ALL].sort((a, b) => a.last - b.last)) { if (stats.pixels <= budget * 0.85) break; if (e === keep || t - e.at < KEEP_MS) continue; const m = MAP.get(e.key); if (m) m.list.splice(m.list.indexOf(e), 1); drop(e); stats.evicted++; } }
/** Give every sprite back (World.release calls this through the releaser), and forget the clock. */
export function clearAtlas() { for (const e of [...ALL]) drop(e); ALL.clear(); MAP.clear(); stats.pixels = 0; ledger.release('props.atlas'); }
registerReleaser(clearAtlas);
/** Switch the atlas off (every call draws directly) or back on: for the tests and for comparing a sprite with the drawing it stands for. */
export function enableAtlas(on) { enabled = !!on; if (!enabled) clearAtlas(); }
/** The pixels the atlas may hold (tests; a quality setting). */
export function setAtlasBudget(px = ATLAS_BUDGET) { budget = px; }
/** Reset the building clock (tests): a fresh frame with nothing spent, and the zoom taken to have rested. */
export function resetAtlasClock() { winAt = lastCall = -1e9; spent = 0; changedAt = -1e9; lastA = 0; }

function mayBuild(t, before, px) {
  if (t - before > GAP_MS || t - winAt > 100) { winAt = t; spent = 0; }
  return spent < BUILD_MS;
}

/**
 * Draw one variant of a thing at (ax, ay) in the world transform the caller has set. `key` names the variant (everything that changes the picture is in it, fog and light included), `rect` is the box
 * [x0, y0, x1, y1] the drawing covers in world pixels relative to its anchor, and `draw(g)` paints it with its anchor at the origin (it must not read the clock: a sprite is a still picture).
 * `dx`, `dy` shift the blit by world pixels (a sway) and land on whole device pixels. Answers true when a sprite was blitted, false when the thing was drawn directly (no canvas, the zoom is moving
 * and there is nothing to stand in, or this frame's building time is spent): the picture is the same either way.
 */
export function blit(ctx, key, rect, draw, ax, ay, dx = 0, dy = 0) {
  const M = enabled && canUse() && typeof ctx.getTransform === 'function' ? ctx.getTransform() : null, a = M ? M.a : 0;
  if (M && a > 0 && !M.b && !M.c) {
    const t = now(), before = lastCall; lastCall = t; if (a !== lastA) { lastA = a; changedAt = t; }
    const sk = Math.round(Math.log2(a) * ZOOM_STEPS);
    let m = MAP.get(key), e = null, other = null;
    if (m) for (let i = 0; i < m.list.length; i++) { const c = m.list[i]; if (c.sk === sk) { e = c; break; } const r = a / c.s; if (r >= REUSE_MIN && r <= REUSE_MAX && (!other || Math.abs(c.sk - sk) < Math.abs(other.sk - sk))) other = c; }
    if (e) stats.hits++;
    else if (t - changedAt >= MOVING_MS) {
      const s = Math.pow(2, sk / ZOOM_STEPS), w = Math.ceil((rect[2] - rect[0]) * s), h = Math.ceil((rect[3] - rect[1]) * s);
      if (w >= 1 && h >= 1 && w * h <= MAX_PX && (stats.pixels + w * h <= budget || (trim(null, t), stats.pixels + w * h <= budget * 1.1)) && mayBuild(t, before, w * h)) {
        const f = surface(w, h);
        if (f) {
          f.g.setTransform(s, 0, 0, s, -rect[0] * s, -rect[1] * s); draw(f.g);
          let img = f.c; if (typeof f.c.transferToImageBitmap === 'function') { try { img = f.c.transferToImageBitmap(); } catch { img = f.c; } }
          e = { key, sk, s, img, w, h, x0: rect[0], y0: rect[1], last: 0, at: t }; if (!m) MAP.set(key, m = { list: [] });
          m.list.push(e); if (m.list.length > 3) { const old = m.list.shift(); drop(old); }
          ALL.add(e); stats.pixels += w * h; stats.builds++; ledger.register('props.atlas', stats.pixels * 4); lastCall = now(); spent += lastCall - t;
          e.last = ++tick;
        }
      }
    }
    if (!e && other) { e = other; stats.stale++; }
    if (e) {
      e.last = ++tick; e.at = t; const k = a / e.s;
      const X = Math.round(a * (ax + dx + e.x0) + M.e), Y = Math.round(a * (ay + dy + e.y0) + M.f);
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (k > 0.998 && k < 1.002) ctx.drawImage(e.img, X, Y); else ctx.drawImage(e.img, X, Y, e.w * k, e.h * k);
        ctx.restore(); return true;
      } catch { ctx.restore(); drop(e); const mm = MAP.get(key); if (mm) mm.list.splice(mm.list.indexOf(e), 1); }
    }
    stats.direct++;
  }
  ctx.save(); ctx.translate(ax + dx, ay + dy); draw(ctx); ctx.restore();
  return false;
}
/** Every sprite the atlas holds as [key, pixels], the largest first (tests, the rig, a look at what fills the budget). */
export const atlasEntries = () => [...ALL].map((e) => [e.key, e.w * e.h]).sort((a, b) => b[1] - a[1]);
/** How many sprites and pixels the atlas holds (tests, the rig). */
export const atlasSize = () => ({ sprites: ALL.size, pixels: stats.pixels });

// ---------------------------------------------------------------- shared props: one sprite for every prop that looks alike
const STILL = { t: 0, wind: 0, night: 0, dim: 0, hz: 0, far: false, lite: false, locked: false, zoff: 0, lights: null, crunch: false, lod: null, boardText: null };
/**
 * The box a prop's drawing covers, in world pixels relative to its anchor P(gx, gy) (the footprint's back corner): the footprint's own diamond plus `ext` = [left, top, right, bottom] of room
 * for what stands out of it, and the reach of the cast shadow to the right and down (0.55 of the height right, 0.27 down: 0.75 x h over a tile edge of 45 world pixels, 32 and 16 per tile along +gx).
 * Pure. Tests hold it against what the drawers really paint (scripts/diag/propbounds.mjs of this track's rig).
 */
export function rectOf(p, ext = [12, 14, 12, 10]) {
  const w = p.w, d = p.d, h = p.h || 0;
  return [-(d * 32) - ext[0] - 7, -(h + ext[1]), w * 32 + ext[2] + 0.55 * h + 8, (w + d) * 16 + ext[3] + 0.27 * h]; // (7 and 8: the penumbra of the cast shadow, 0.2 tile each side)
}
/** The name of a prop's look: its kind, its size and the fields that change its picture (`vary`: names of fields of the prop; '#' adds the prop's four-way variant, see toys.vseed). */
export function lookKey(kind, p, vary, env, vs) {
  let k = kind + '|' + p.w + '|' + p.d + '|' + p.h;
  for (let i = 0; i < vary.length; i++) { const f = vary[i]; k += '|' + (f === '#' ? vs : p[f]); }
  return k + '|' + Math.round((env.dim || 0) * 16) + '|' + Math.round((env.hz || 0) * 50) + '|' + (env.lite ? 1 : 0);
}
/**
 * Register the V2 drawer of one static prop kind as a shared sprite: `body(g, p, env)` paints the prop in the absolute world coordinates it always did, `live(ctx, p, env)` paints what moves or glows
 * straight onto the scene, `hit(p)` gives the hit polygons a clickable prop returns. The drawing is baked once per look (kind, size, the `vary` fields, the veil) into the variant atlas at the exact device
 * scale and blitted at every place that look stands, so forty lamps are one bitmap, and the box it covers is the footprint plus `ext`, not the generous box of the per-prop sprite cache.
 * The body sees a still world (no clock, no wind, no lights, day shadows): what depends on time belongs in `live`.
 */
let ATTEND = null;
/** The hook that draws what stands beside a prop at near zoom (life.js sets it): called with (ctx, prop, env, kind) after the prop's own drawing. */
export const setAttend = (fn) => { ATTEND = fn; };
export const attendOf = (ctx, p, env, kind) => { if (ATTEND !== null) ATTEND(ctx, p, env, kind); };
/** Every shared prop's definition by kind (tests and the rig measure what a body really paints against the box it is given). */
export const SHARED = new Map();
export function shared(kind, def) {
  SHARED.set(kind, def);
  const vary = def.vary || [], ext = def.ext, vs = vary.includes('#') ? vseed : null;
  const memo = new WeakMap(); // prop -> { sig, key, rect, ax, ay }: a prop's look changes only with the veil and the lite flag, so its key and box are made once
  registerProp(kind, (ctx, p, env) => {
    const sig = Math.round((env.dim || 0) * 16) * 100000 + Math.round((env.hz || 0) * 50) * 10 + (env.lite ? 1 : 0);
    let m = memo.get(p);
    if (!m || m.sig !== sig) { const a = P(p.gx, p.gy); m = { sig, key: lookKey(kind, p, vary, env, vs ? vs(p) : 0), rect: rectOf(p, ext), ax: a[0], ay: a[1], draw: null }; memo.set(p, m); }
    const e = STILL; e.dim = env.dim; e.hz = env.hz; e.far = env.far; e.lite = env.lite; e.night = 0;
    if (!m.draw) { const pp = p, ax = m.ax, ay = m.ay; m.draw = (g) => { g.translate(-ax, -ay); def.body(g, pp, STILL); }; }
    blit(ctx, m.key, m.rect, m.draw, m.ax, m.ay);
    if (def.live) def.live(ctx, p, env);
    if (ATTEND !== null) ATTEND(ctx, p, env, kind);
    return def.hit ? def.hit(p) : null;
  });
}
