// Small things the world's modules share: the zoom thresholds the drawing and the labels agree on, the fog strength of a locked district, and the money format of the labels.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md). Kept tiny on purpose: a constant a track needs alone lives in that track's module.
export const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 2 : 0));
export const money = (v) => '$' + compact(v);
export const FAR_ZOOM = 0.42;      // below this zoom the world draws plain blocks and dots
export const PIP_ZOOM = 0.45;      // below this zoom a building's own bar is dropped (it is a few pixels) and the district shows pips instead; the bar returns at and above it
export const FOG_DIM = 0.5;        // how far a locked district's colours are pulled towards the fog (fxOf's dim for a district under cloud)

// ---- a buyer's opacity: one rise, a plateau, one fall (characters.js and ents-actors.js draw it, world.js takes the buyer out). A buyer used to arrive at full strength, fade to a fifth over 4.2 s once its lead went and vanish
// from there at 4.5 s: on a clock that is running fast, where a lead lasts a few seconds, the crowd was a strobe of pops and ghosts (the NPCs "blinking in and out").
export const ARRIVE_MS = 700;   // a buyer that arrives comes in over this long (one made before the first frame, `born` 0, is simply there)
export const HOLD_MS = 2500;    // a buyer that arrived stands at full strength at least this long whatever its lead does, so a lead that lasts a few seconds is a buyer you see and not a flicker
export const LEAVE_MS = 3000;   // and goes over this long, to nothing: nothing is drawn at a strength it then drops from
const fadeFrom = (born, leaveAt) => Math.max(leaveAt, born > 0 ? born + HOLD_MS : 0);
/** The opacity of a buyer, 0 to 1. `born`: when it was made (ms of the world's clock, 0 before the first frame), `leaveAt`: when its lead went (null while it has one), `now`: the frame's time. Pure. */
export function leadAlpha(born, leaveAt, now) {
  let a = born > 0 ? Math.min(1, Math.max(0, (now - born) / ARRIVE_MS)) : 1;
  if (leaveAt != null) a *= Math.min(1, Math.max(0, 1 - (now - fadeFrom(born, leaveAt)) / LEAVE_MS));
  return a;
}
/** The time a buyer whose lead went at `leaveAt` has faded to nothing and goes out of the world. */
export const leaveEnd = (born, leaveAt) => fadeFrom(born, leaveAt) + LEAVE_MS;

// ---- the request bubble over a buyer (a price and, when the buyer is in a hurry, a gold "!"): it came on with the buyer at once and went when its lead went, at once, so on a fast clock the requests popped on and off over
// buyers that now fade. It comes in a beat after the buyer and goes out when the lead does, over half a second (the buyer itself stands for at least HOLD_MS, see leadAlpha).
export const BUBBLE_LAG_MS = 250, BUBBLE_IN_MS = 400, BUBBLE_OUT_MS = 500;
/** The opacity of a buyer's bubble, 0 to 1: `born`, `leaveAt` and `now` as for leadAlpha (a buyer made before the first frame has its bubble). Pure. */
export function bubbleAlpha(born, leaveAt, now) {
  let a = born > 0 ? Math.min(1, Math.max(0, (now - born - BUBBLE_LAG_MS) / BUBBLE_IN_MS)) : 1;
  if (leaveAt != null) a *= Math.min(1, Math.max(0, 1 - (now - leaveAt) / BUBBLE_OUT_MS));
  return a;
}
