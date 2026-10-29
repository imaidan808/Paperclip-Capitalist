// Small things the world's modules share: the zoom thresholds the drawing and the labels agree on, the fog strength of a locked district, and the money format of the labels.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md). Kept tiny on purpose: a constant a track needs alone lives in that track's module.
export const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 2 : 0));
export const money = (v) => '$' + compact(v);
export const FAR_ZOOM = 0.42;      // below this zoom the world draws plain blocks and dots
export const PIP_ZOOM = 0.45;      // below this zoom a building's own bar is dropped (it is a few pixels) and the district shows pips instead; the bar returns at and above it
export const FOG_DIM = 0.5;        // how far a locked district's colours are pulled towards the fog (fxOf's dim for a district under cloud)
