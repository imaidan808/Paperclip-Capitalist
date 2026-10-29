// The level-of-detail ladder: four zoom bands and one crossfade rule, as one pure function. See docs/ART_DIRECTION.md section 7 and docs/RENDER_PLAN.md.
// Owner: T5 RASTER QUALITY. Every track reads the zoom through lodOf and never invents a threshold of its own.
//
// The rule (art direction commandment 6): detail is additive. A finer band only adds marks on top of the coarser picture, never a different picture, and the marks fade in over
// plus or minus 15% of the band's threshold, as a pure function of the zoom, so a pinch fades them smoothly both ways and nothing pops.
//
//   band   zoom            reads as
//   far    to 0.30         a bright toy map
//   mid    0.30 to 0.70    a model village
//   near   0.70 to 1.40    a lived-in toy town (the working zoom is 0.9 to 1.2)
//   close  1.40 and over   a crafted diorama
//
// lodOf(zoom, out) answers { zoom, band, index, blend, level, nominal, nominalIndex, detail } and writes into `out` when one is given (the world passes the same record every frame:
// no allocation).
//   detail         [1, mid, near, close]: the alpha 0..1 of each band's additions (0 below DETAIL_MIN). detail[0] is always 1 (the base picture is complete at every band). Draw with these: they are the
//                  continuous quantity, a pure function of the zoom, so a pinch fades marks in and out smoothly both ways
//   band, index    the FINEST band that has anything visible (detail above DETAIL_MIN): what a sprite cache should build and a layer should draw. Draw every band up to it in full and
//                  the band itself at alpha `blend`
//   blend          detail[index]: 1 once a band's marks are fully in, small (just above DETAIL_MIN) as they begin
//   level          detail[1] + detail[2] + detail[3]: one continuous number from 0 (far) to 3 (close) for anything that scales smoothly with the ladder (wave levels, tuft counts)
//   nominal        the band the zoom is in by the bands' nominal edges (0.30, 0.70, 1.40): for decisions and labels, never for drawing
//
// Overlays that fade with `detail[i]` are built only for things in view whose alpha would exceed DETAIL_MIN, and only once the zoom has rested.

export const BANDS = Object.freeze(['far', 'mid', 'near', 'close']);
/** Upper edge of far, mid and near: the zoom at which the next band begins. */
export const BAND_AT = Object.freeze([0.30, 0.70, 1.40]);
/** The crossfade spans this share of the threshold on either side of it. */
export const FADE = 0.15;
/** Below this alpha an overlay is not built and not drawn. */
export const DETAIL_MIN = 0.02;

const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/** The alpha of the marks that belong to a band whose threshold is `t`: 0 below t x (1 - FADE), 1 above t x (1 + FADE), smooth between. */
export const detailAlpha = (zoom, t) => smooth((zoom - (1 - FADE) * t) / (2 * FADE * t));

const floor = (a) => (a > DETAIL_MIN ? a : 0); // an alpha under the floor is no alpha: nothing is built or drawn for it
/** The band index (0 far, 1 mid, 2 near, 3 close) by the nominal edges. */
export const bandIndex = (zoom) => (zoom < BAND_AT[0] ? 0 : zoom < BAND_AT[1] ? 1 : zoom < BAND_AT[2] ? 2 : 3);

export function lodOf(zoom, out) {
  const o = out || {};
  const d = o.detail || (o.detail = [1, 0, 0, 0]);
  d[0] = 1; d[1] = floor(detailAlpha(zoom, BAND_AT[0])); d[2] = floor(detailAlpha(zoom, BAND_AT[1])); d[3] = floor(detailAlpha(zoom, BAND_AT[2]));
  const i = d[3] > DETAIL_MIN ? 3 : d[2] > DETAIL_MIN ? 2 : d[1] > DETAIL_MIN ? 1 : 0, n = bandIndex(zoom);
  o.zoom = zoom; o.index = i; o.band = BANDS[i]; o.blend = d[i]; o.level = d[1] + d[2] + d[3]; o.nominalIndex = n; o.nominal = BANDS[n];
  return o;
}
