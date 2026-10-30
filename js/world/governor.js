// The quality governor's rules, pure: what costs a frame is judged by, what each tier drops, how fast a frame loop may run. The state (the smoothed cost, the tier, the waits) lives on the World (world.js govern); the
// numbers and the table are here so a test can hold them and no track invents a threshold of its own. Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5).
//
// Two signals. The cost of the frame's own JavaScript (what the loop measures around update and draw) cannot see raster that the browser does later, so the INTERVAL between two drawn frames is the second: a frame that
// arrives well after the loop's own target is as slow as the gap says, however cheap its drawing was (DIAGNOSIS P1). Both feed one smoothed cost; over SLOW_MS for a few frames steps a tier down, under FAST_MS for a long spell
// steps one back up (and the wait doubles when the picture tips over again soon after a step up: a machine on the edge settles on the lower tier instead of flickering).
//
// What a tier drops, in order. A tier lowers the LOD band (the overlays of a finer band are not built, the sea drops its curls) and never makes the picture blur: the base is complete at every tier. Tier 4 also takes a quarter off
// the canvas density (the one drop that softens, kept because nothing else buys that much); the canvas is reallocated only past tier 3 and given back only under tier 2 (World.targetDpr).
export const SLOW_MS = 22, FAST_MS = 16;
export const GOV_WAIT = 10, GOV_DOWN = 3;      // frames of good cost before one step back up (it doubles while the picture keeps tipping over), frames of bad cost before one step down
/**
 * Frames in a row that filled a cache (a ground chunk baked, a sprite made, a cloud baked) and are not judged. A cache is filled once: the load of the first view is seconds of such frames on a laptop four times slower than a
 * Mac, and judging them sent that laptop down five tiers and back up, over and over (the canvas density flipping between 2 and 1.5, which bakes the ground again, and the lights, smoke and people of `lite` going out and
 * coming back: the picture blinked), where the steady frames would have held tier 0 or 1. The frame after one that was not judged arrives late because of it, so its gap is not held against it either. A build that goes on
 * longer than this (300 frames: ten seconds of a still picture) is not a load, a cache that cannot hold its set, and is judged as any frame is.
 */
export const BUILD_GRACE = 300;
export const GOV_TOP = 6;                      // the lowest tier
/** A gap between two drawn frames of more than this many target intervals is a late frame. */
export const LATE = 1.6;
/** A gap of more than this many target intervals is a frame the machine could not keep up with, whatever it cost to draw. */
export const VERY_LATE = 2.2;

/**
 * The cost a frame is judged by: the JavaScript time, or, when the frame arrived late for the loop's own target (`fps`), the gap's share (0.8 of it: a late frame has already waited a vsync or two the machine could
 * not help), and never under SLOW_MS + 4 when it was very late. `gap` is 0 after a pause (the first frame after a hidden tab is never judged by a gap).
 */
export function judge(cost, gap, fps) {
  if (!(gap > 0) || !(fps > 0)) return cost;
  const iv = 1000 / fps; if (gap <= iv * LATE) return cost;
  return Math.max(cost, gap * 0.8, gap > iv * VERY_LATE ? SLOW_MS + 4 : 0);
}

/**
 * The frame rate the loop may run at: `slow` is the tier. A camera that is still has only animation to draw (30 fps, then 20 and 15 as the tiers fall); a camera that MOVES draws every refresh while the machine keeps up
 * (60, uncapped by the 30 fps that was meant for a still picture's idle motion; DIAGNOSIS P4), and falls to the same 30, 20 and 15 from tier 3.
 */
export function fpsFor(slow, moving) { return slow > 4 ? 15 : slow > 2 ? 20 : moving ? 60 : 30; }

/**
 * What each tier drops, one row a tier (0 drops nothing). `lod` is the finest band the world still builds and draws overlays for (`close`, `near`, `mid`, `base`), `sea` and `clouds` what those layers drop, `dpr` the
 * canvas density's share, `fps` the loop's rate for a still camera. The other tracks read `env.tier` and drop what their row says; the sprite cache applies the `lod` column itself (sprites.js drawOverlays).
 */
const cum = (steps) => steps.map((_, i) => steps.slice(0, i + 1).flat()); // each tier drops what the tiers before it dropped, and more
const SEA_DROPS = cum([[], ['caustics', 'rings', 'glints'], ['curls', 'crests'], [], [], ['levels'], []]);
const CLOUD_DROPS = cum([[], ['sparkle'], ['rim', 'windows'], ['puffs'], [], [], []]);
export const TIER_TABLE = Object.freeze([
  { tier: 0, lod: 'close', dpr: 1, fps: 30 },
  { tier: 1, lod: 'close', dpr: 1, fps: 30, micro: false },
  { tier: 2, lod: 'close', dpr: 1, fps: 30, micro: false },
  { tier: 3, lod: 'near', dpr: 1, fps: 20, micro: false, foamBreath: false },
  { tier: 4, lod: 'near', dpr: 0.75, fps: 20, micro: false, foamBreath: false },
  { tier: 5, lod: 'mid', dpr: 0.75, fps: 15, micro: false, foamBreath: false, dressing: false },
  { tier: 6, lod: 'mid', dpr: 0.75, fps: 15, micro: false, foamBreath: false, dressing: false, sm: false },
].map((r) => Object.freeze({ ...r, sea: Object.freeze(SEA_DROPS[r.tier].slice()), clouds: Object.freeze(CLOUD_DROPS[r.tier].slice()) })));
/** The row of the table a tier reads from (a tier out of range is clamped). */
export const tierRow = (slow) => TIER_TABLE[Math.max(0, Math.min(GOV_TOP, slow | 0))];
/** Does a band's overlay get built at this tier? (`near` and `close`; the same rule sprites.js applies.) */
export const bandBuilt = (slow, band) => (band === 'close' ? slow < 3 : band === 'near' ? slow < 5 : true);
