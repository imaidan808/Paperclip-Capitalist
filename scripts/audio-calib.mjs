// The calibration's arithmetic, pure and tested (tests/audio-calibration.test.mjs): scripts/audio-check.mjs measures, this decides the trims. Nothing here touches a browser.
//   1. Stage 1 trims every variant so its K-weighted active level (plus the tier's duration compensation) is the tier's target, held under the tier's peak ceiling. The level is the median of the plays from
//      n places in the noise (I3), the peak their 95th percentile.
//   2. Stage 2 (I2) moves each variant so that its Fast level under the two models of a listener, the K-weighted one and the quiet laptop (a 220 Hz high-pass, then A-weighting), is as far above the tier's
//      median in one as it is below it in the other: the same distance from the middle under both, as little as the sound allows. The tier medians are those of the variants without their own softness
//      (`trimDbOf`: a loss twin is meant to be a little under its gain). The move is at most BAL_MAX dB; a variant that needs more has the wrong spectrum, and the check says so.
//   3. A variant whose level depends on where in the noise it starts (a footstep is five milliseconds of noise) is given a list of the places that put it at the median.
//   Fourth round: (R1) the peak that a ceiling holds is the 95th percentile of 32 plays the way the engine makes them (`peakJ`: pitch jitter, gain jitter and the place in the noise), not the one play the
//   calibration made, which the engine's jitter then exceeded by 0.5 to 2 dB for the loud tier; (R2) a third model, the quiet laptop's MOMENTARY loudness (400 ms, A-weighted after the high-pass), joins the
//   two Fast levels in stage 2: a sound's length counts under a longer integration and the purchases and losses of the medium tier sat 3 to 5 dB under their tier in it.
import { TIER_TARGET, TIER_CEIL, tierComp, trimDbOf } from '../js/audio/recipes.js';

export const LIST_SPREAD = 1.5; // dB: a variant whose Fast level moves more than this with the place in the noise gets a list of places
export const LIST_SIZE = 8;
export const BAL_MAX = 3;       // dB: the most stage 2 moves a variant
export const CEIL_MARGIN = 0.5; // dB kept under a tier's peak ceiling by the 95th percentile of 32 engine-like plays, for the plays of other seeds that the check draws (it was 0.2 on a single play: R1)
export const TIERS = ['tiny', 'medium', 'loud'];
export const median = (a) => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
export const percentile = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)]; };
const r1 = (x) => Math.round(x * 10) / 10;
/** The figure the places in the noise are ranked by: the middle of the two models' Fast levels, which is what stage 2 balances. */
const zOf = (c) => (Number.isFinite(c.lapMomA) ? (c.fast + c.lapFastA + c.lapMomA) / 3 : (c.fast + c.lapFastA) / 2);
/** The peak a ceiling holds a row to: the 95th percentile of the engine-like plays when the row has it (R1), else the highest peak of the calibration's own plays. */
export const peakOf = (r) => (Number.isFinite(r.peakJ) ? Math.max(r.peak, r.peakJ) : r.peak);
/** The models a row set is balanced on: the two Fast levels, and the momentary loudness of the quiet laptop when every row has it. */
export const METRICS = ['fast', 'lapFastA', 'lapMomA'];
export const metricsOf = (rows) => METRICS.filter((m) => rows.length && rows.every((r) => Number.isFinite(r[m])));

/** The up to `size` plays whose figure is nearest the median (and whose peak is not past the median's by more than 1 dB), as the places in the noise to use. */
export function chooseList(cands, size = LIST_SIZE) {
  const zm = median(cands.map(zOf)), pm = median(cands.map((c) => c.peak));
  const ok = cands.filter((c) => c.peak <= pm + 1);
  return (ok.length >= Math.min(size, 4) ? ok : cands).map((c) => ({ c, d: Math.abs(zOf(c) - zm) })).sort((a, b) => a.d - b.d).slice(0, size).map((x) => x.c);
}
/** A row's figures as the medians (and the highest peak) of the given plays: the check plays a subset of the calibration's places, so its highest peak can never be over the calibration's. */
export function restat(row, plays) {
  const col = (f) => plays.map((c) => c[f]);
  return { ...row, level: median(col('level')), fast: median(col('fast')), lapFast: median(col('lapFast')), lapFastA: median(col('lapFastA')), ...(plays.every((c) => Number.isFinite(c.lapMomA)) ? { lapMomA: median(col('lapMomA')) } : {}), peak: Math.max(...col('peak')), spread: Math.max(...col('fast')) - Math.min(...col('fast')), ncand: plays.length };
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
  if (r.tier === 'amb') { let t = TIER_TARGET.amb - r.level; if (peakOf(r) + t > TIER_CEIL.amb - CEIL_MARGIN) t = TIER_CEIL.amb - CEIL_MARGIN - peakOf(r); return t; }
  const target = TIER_TARGET[r.tier] + tierComp(r.tier, r.ms) + trimDbOf(r.id, r.v);
  let t = target - r.level;
  if (peakOf(r) + t > TIER_CEIL[r.tier] - CEIL_MARGIN) t = TIER_CEIL[r.tier] - CEIL_MARGIN - peakOf(r);
  return t;
}
/** The tier medians of the two Fast figures with every variant's own softness taken out, at the given trims (the pool members are left out: they follow their first member). */
export function tierMedians(rows, t) {
  const norm = (r, f) => r[f] + t[r.key] - trimDbOf(r.id, r.v), M = {}, ms = metricsOf(rows);
  for (const tier of TIERS) {
    const L = rows.filter((r) => r.tier === tier && !r.key.includes('@'));
    if (L.length) M[tier] = { k: median(L.map((r) => norm(r, 'fast'))), a: median(L.map((r) => norm(r, 'lapFastA'))), ...(ms.includes('lapMomA') ? { m: median(L.map((r) => norm(r, 'lapMomA'))) } : {}) };
  }
  return M;
}
/** Stage 2: centre each variant between the models (the two Fast levels, and the quiet laptop's momentary loudness when the rows have it). Returns the new trims (a map by key) and the move each variant made. */
export function centre(rows, t1, { iterations = 4, max = BAL_MAX } = {}) {
  const t = { ...t1 }, norm = (r, f) => r[f] + t[r.key] - trimDbOf(r.id, r.v), ms = metricsOf(rows), key = { fast: 'k', lapFastA: 'a', lapMomA: 'm' };
  for (let it = 0; it < iterations; it++) {
    const M = tierMedians(rows, t);
    for (const r of rows) {
      const m = M[r.tier]; if (!m) continue;
      const devs = ms.map((f) => norm(r, f) - m[key[f]]); // how far above the tier's middle the variant is under each model
      let want = t[r.key] - devs.reduce((x, y) => x + y, 0) / devs.length;
      want = Math.max(t1[r.key] - max, Math.min(t1[r.key] + max, want));
      if (peakOf(r) + want > TIER_CEIL[r.tier] - CEIL_MARGIN) want = TIER_CEIL[r.tier] - CEIL_MARGIN - peakOf(r); // the ceiling is never traded for balance
      t[r.key] = want;
    }
  }
  for (const k of Object.keys(t)) t[k] = r1(t[k]);
  return t;
}
/**
 * A loss is never louder than the gain it mirrors (2.2: spending is quieter than earning), under the K-weighted Fast level and under the quiet laptop's. The pairs are [gain, loss]. Stage 2 centres every
 * variant between the models, which with three of them left nine of the twelve pairs a few tenths the wrong way round, so the pairs are held after it: a loss that is not at least TWIN_MARGIN under its gain
 * on both Fast levels is lowered to be (fourth round, R5: sale.reject#fake and bank.draw#b were louder than their gains and were not in the list).
 */
export const LOSS_TWINS = [['cash.in#s', 'cash.out#s'], ['cash.in#m', 'cash.out#m'], ['cash.in#l', 'cash.out#l'], ['sale.win#w', 'sale.herd#h'], ['sale.win#w', 'sale.scam#s'], ['sale.win#w', 'sale.reject#nofit'], ['sale.win#w', 'sale.reject#fake'], ['ui.toggle#on', 'ui.toggle#off'],
  ['deal.result#good', 'deal.result#bad'], ['pitch.fit#up', 'pitch.fit#down'], ['audit.result#pass', 'audit.result#fail'], ['bid.hammer#won', 'bid.hammer#lost'], ['repair.done#great', 'repair.done#rough'], ['bank.repay#full', 'bank.draw#b']];
export const TWIN_MARGIN = 0.3; // dB under its gain on both Fast levels (the check allows the loss 0.3 over)
export function holdTwins(rows, t, pairs = LOSS_TWINS) {
  const by = Object.fromEntries(rows.map((r) => [r.key, r])), out = { ...t };
  for (const [g, l] of pairs) {
    const G = by[g], L = by[l]; if (!G || !L) continue;
    for (const f of ['fast', 'lapFastA']) {
      if (!Number.isFinite(G[f]) || !Number.isFinite(L[f])) continue;
      const over = (L[f] + out[l]) - (G[f] + out[g]) + TWIN_MARGIN; // positive: the loss is not far enough under
      if (over > 0) out[l] -= over;
    }
  }
  for (const k of Object.keys(out)) out[k] = r1(out[k]);
  return out;
}
/** The whole decision: rows with their plays (`cands`, from `m.run(..., { n, keep: true })`) -> { sounds, oneShots, lists, rows }. */
export function calibrate(rowsIn, shotsIn) {
  const a = withLists(rowsIn), s = withLists(shotsIn);
  const t1 = {}; for (const r of a.rows) t1[r.key] = stage1(r);
  const t = holdTwins(a.rows, centre(a.rows, t1));
  const oneShots = {}; for (const r of s.rows) oneShots[r.id] = r1(stage1(r));
  return { sounds: t, oneShots, lists: { ...a.lists, ...s.lists }, rows: a.rows, stage1: t1 };
}
