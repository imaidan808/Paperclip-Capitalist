// The calibration's arithmetic, pure and tested (tests/audio-calibration.test.mjs): scripts/audio-check.mjs measures, this decides the trims. Nothing here touches a browser.
//   1. Stage 1 trims every variant so its K-weighted active level (plus the tier's duration compensation) is the tier's target, held under the tier's peak ceiling. The level is the median of the plays from
//      n places in the noise (I3), the peak their 95th percentile.
//   2. Stage 2 (I2) moves each variant so that its Fast level under the two models of a listener, the K-weighted one and the quiet laptop (a 220 Hz high-pass, then A-weighting), is as far above the tier's
//      median in one as it is below it in the other: the same distance from the middle under both, as little as the sound allows. The tier medians are those of the variants without their own softness
//      (`trimDbOf`: a loss twin is meant to be a little under its gain). The move is at most BAL_MAX dB; a variant that needs more has the wrong spectrum, and the check says so.
//   3. A variant whose level depends on where in the noise it starts (a footstep is five milliseconds of noise) is given a list of the places that put it at the median.
import { TIER_TARGET, TIER_CEIL, tierComp, trimDbOf } from '../js/audio/recipes.js';

export const LIST_SPREAD = 1.5; // dB: a variant whose Fast level moves more than this with the place in the noise gets a list of places
export const LIST_SIZE = 8;
export const BAL_MAX = 3;       // dB: the most stage 2 moves a variant
export const CEIL_MARGIN = 0.2; // dB kept under a tier's peak ceiling, for the plays the engine makes that no calibration play was
export const TIERS = ['tiny', 'medium', 'loud'];
export const median = (a) => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
export const percentile = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)]; };
const r1 = (x) => Math.round(x * 10) / 10;
/** The figure the places in the noise are ranked by: the middle of the two models' Fast levels, which is what stage 2 balances. */
const zOf = (c) => (c.fast + c.lapFastA) / 2;

/** The up to `size` plays whose figure is nearest the median (and whose peak is not past the median's by more than 1 dB), as the places in the noise to use. */
export function chooseList(cands, size = LIST_SIZE) {
  const zm = median(cands.map(zOf)), pm = median(cands.map((c) => c.peak));
  const ok = cands.filter((c) => c.peak <= pm + 1);
  return (ok.length >= Math.min(size, 4) ? ok : cands).map((c) => ({ c, d: Math.abs(zOf(c) - zm) })).sort((a, b) => a.d - b.d).slice(0, size).map((x) => x.c);
}
/** A row's figures as the medians (and the highest peak) of the given plays: the check plays a subset of the calibration's places, so its highest peak can never be over the calibration's. */
export function restat(row, plays) {
  const col = (f) => plays.map((c) => c[f]);
  return { ...row, level: median(col('level')), fast: median(col('fast')), lapFast: median(col('lapFast')), lapFastA: median(col('lapFastA')), peak: Math.max(...col('peak')), spread: Math.max(...col('fast')) - Math.min(...col('fast')), ncand: plays.length };
}
/** Give every noisy row with a spread over LIST_SPREAD a list, and take its figures from the listed places alone. Returns { rows, lists: { key: [offsets] } }. */
export function withLists(rows) {
  const lists = {};
  const out = rows.map((r) => {
    if (!r.cands || r.spread <= LIST_SPREAD) return r;
    const pick = chooseList(r.cands);
    lists[r.key] = pick.map((c) => Math.round(c.c * 1000) / 1000);
    return restat(r, pick);
  });
  return { rows: out, lists };
}
/** Stage 1. */
export function stage1(r) {
  if (r.tier === 'amb') { let t = TIER_TARGET.amb - r.level; if (r.peak + t > TIER_CEIL.amb - CEIL_MARGIN) t = TIER_CEIL.amb - CEIL_MARGIN - r.peak; return t; }
  const target = TIER_TARGET[r.tier] + tierComp(r.tier, r.ms) + trimDbOf(r.id, r.v);
  let t = target - r.level;
  if (r.peak + t > TIER_CEIL[r.tier] - CEIL_MARGIN) t = TIER_CEIL[r.tier] - CEIL_MARGIN - r.peak;
  return t;
}
/** The tier medians of the two Fast figures with every variant's own softness taken out, at the given trims (the pool members are left out: they follow their first member). */
export function tierMedians(rows, t) {
  const norm = (r, f) => r[f] + t[r.key] - trimDbOf(r.id, r.v), M = {};
  for (const tier of TIERS) { const L = rows.filter((r) => r.tier === tier && !r.key.includes('@')); if (L.length) M[tier] = { k: median(L.map((r) => norm(r, 'fast'))), a: median(L.map((r) => norm(r, 'lapFastA'))) }; }
  return M;
}
/** Stage 2: centre each variant between the two models. Returns the new trims (a map by key) and the move each variant made. */
export function centre(rows, t1, { iterations = 4, max = BAL_MAX } = {}) {
  const t = { ...t1 }, norm = (r, f) => r[f] + t[r.key] - trimDbOf(r.id, r.v);
  for (let it = 0; it < iterations; it++) {
    const M = tierMedians(rows, t);
    for (const r of rows) {
      const m = M[r.tier]; if (!m) continue;
      const kv = norm(r, 'fast') - m.k, av = norm(r, 'lapFastA') - m.a; // how far above the tier's middle the variant is under each model
      let want = t[r.key] - (kv + av) / 2;
      want = Math.max(t1[r.key] - max, Math.min(t1[r.key] + max, want));
      if (r.peak + want > TIER_CEIL[r.tier] - CEIL_MARGIN) want = TIER_CEIL[r.tier] - CEIL_MARGIN - r.peak; // the ceiling is never traded for balance
      t[r.key] = want;
    }
  }
  for (const k of Object.keys(t)) t[k] = r1(t[k]);
  return t;
}
/** The whole decision: rows with their plays (`cands`, from `m.run(..., { n, keep: true })`) -> { sounds, oneShots, lists, rows }. */
export function calibrate(rowsIn, shotsIn) {
  const a = withLists(rowsIn), s = withLists(shotsIn);
  const t1 = {}; for (const r of a.rows) t1[r.key] = stage1(r);
  const t = centre(a.rows, t1);
  const oneShots = {}; for (const r of s.rows) oneShots[r.id] = r1(stage1(r));
  return { sounds: t, oneShots, lists: { ...a.lists, ...s.lists }, rows: a.rows, stage1: t1 };
}
