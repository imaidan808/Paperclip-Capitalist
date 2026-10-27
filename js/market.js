// Pure economic formulas. No state, no DOM: these are the equations students are graded on.
import { ASSETS, BUYERS, CM, BROKEN_FACTOR, TOTAL_DAYS } from './config.js';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Asset Utility Score = (Scarcity x Local Demand) - Depreciation Rate */
export function utilityScore(scarcity, demand, depreciation) { return scarcity * demand - depreciation; }

/** Price index around the class base price. Utility 0 -> 0.5x, 100 -> 1.5x, surge conditions can push to 2.5x. */
export const priceIndex = (u) => 0.5 + clamp(u, 0, 200) / 100;

/** Market Saturation Index S_i = min(1, V_niche / (V_total + eps)) */
export function saturation(vNiche, vTotal) { return Math.min(1, vNiche / (vTotal + 1e-9)); }

/**
 * Creativity Multiplier (refined spec):
 *   Cm = [beta_min + ln((V_total + 2) / (V_niche + 1))] * (1 - S_i), clamped to [0.40, 3.14]
 * The spec's edge-case table fixes the floor (herd trap = 0.40) and ceiling (pioneer = 3.14).
 */
export function creativity(vNiche, vTotal) {
  const S = saturation(vNiche, vTotal);
  const raw = (CM.beta + Math.log((vTotal + 2) / (vNiche + 1))) * (1 - S);
  return clamp(raw, CM.min, CM.max);
}
export function creativityBand(cm) {
  if (cm <= 0.55) return { id: 'herd', label: 'Linear herd trap', tone: 'bad' };
  if (cm < 1.3) return { id: 'crowded', label: 'Crowded', tone: 'warn' };
  if (cm < 2.4) return { id: 'balanced', label: 'Balanced', tone: 'ok' };
  return { id: 'pioneer', label: 'Pioneer vector', tone: 'good' };
}

/** Economic Efficiency Index. startFloor lets an instructor stop a $0.05 start from dwarfing every other profile. */
export function eei(endNetWorth, startCapital, daysRemaining, startFloor = 0) {
  const start = Math.max(startCapital, startFloor, 0.01);
  return (endNetWorth / start) * (1 + clamp(daysRemaining, 0, TOTAL_DAYS) / TOTAL_DAYS);
}

/** Peer trade variance: deviation from the baseline (the lower side), so 4200 vs 3900 = 7.7%. Capped at 999%. */
export function fmvVariance(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi <= 0) return 0;
  if (lo <= 0) return 9.99;
  return Math.min(9.99, (hi - lo) / lo);
}

export function gini(values) {
  const v = values.filter((x) => Number.isFinite(x)).map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length, sum = v.reduce((a, b) => a + b, 0);
  if (n < 2 || sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * v[i];
  return acc / (n * sum);
}

/** Ops: broken-asset restoration quality and repair cost. Reproduces the Broken Fleet Van example (high Ops ~ $20, Ops 1 = $1,200 and half the value). */
export const restoreQuality = (ops) => 0.5 + 0.5 * Math.min(1, (ops - 1) / 4);
export const repairCostFor = (base, ops, mult = 1) => base * Math.pow(0.42, ops - 1) * mult;

/** Fit between a buyer and an asset's tags, 0..1. */
export function fitOf(cls, buyerId) {
  const a = ASSETS[cls], b = BUYERS[buyerId];
  if (!a || !b) return 0;
  const likes = a.tags.map((t) => b.like[t] || 0).filter((x) => x > 0).sort((x, y) => y - x);
  if (!likes.length) return 0;
  return Math.min(1, likes[0] + 0.15 * (likes.length - 1));
}
export const fitMult = (fit) => lerp(0.4, 1.35, fit);
export function fitLabel(fit) {
  if (fit < 0.15) return 'No fit';
  if (fit < 0.5) return 'Weak fit';
  if (fit < 0.85) return 'Good fit';
  return 'Perfect fit';
}

export function nicheKey(zone, cls, buyer) { return zone + '|' + cls + '|' + buyer; }

/** Fair market value of one asset in a zone under the given event modifiers. */
export function assetFMV(a, zone, mods, crowd = 1) {
  const def = ASSETS[a.cls];
  if (!def) return 0;
  const dem = def.dem[zone - 1];
  const dm = demandMult(def, zone, mods) * crowd;
  const base = dem <= 0 ? def.base * 0.15 : def.base * priceIndex(utilityScore(def.sc, dem * dm, def.dep)) * priceMult(def, zone, mods);
  return base * (a.quality ?? 1) * (a.wear ?? 1) * (a.cond === 'broken' ? BROKEN_FACTOR : 1);
}
export function utilityIn(cls, zone, mods, crowd = 1) {
  const def = ASSETS[cls], dem = def.dem[zone - 1];
  return utilityScore(def.sc, dem * demandMult(def, zone, mods) * crowd, def.dep);
}
const hits = (def, e, zone) => (!e.zones || e.zones.includes(zone)) && ((e.tags && e.tags.some((t) => def.tags.includes(t))) || (e.cls && e.cls === def.id));
export function demandMult(def, zone, mods) {
  let m = 1;
  for (const e of mods?.demand || []) if (hits(def, e, zone)) m *= e.mult;
  return m;
}
export function priceMult(def, zone, mods) {
  let m = 1;
  for (const e of mods?.price || []) if (hits(def, e, zone)) m *= e.mult;
  return m;
}
export function speedMult(def, zone, mods) {
  let m = 1;
  for (const e of mods?.speed || []) if (hits(def, e, zone)) m *= e.mult;
  return m;
}
for (const [id, d] of Object.entries(ASSETS)) d.id = id;

/** Which buyer is the "obvious channel" for a class in a zone (what most of the cohort picks first). */
export function obviousBuyer(zone, cls) {
  let best = null, bs = -1;
  for (const [id, b] of Object.entries(BUYERS)) {
    if (b.zone !== zone) continue;
    const s = fitOf(cls, id) ** 3 * b.pop;
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

export function fmtMoney(x, opts = {}) {
  if (!Number.isFinite(x)) return '$0';
  const sign = x < 0 ? '-' : opts.plus && x > 0 ? '+' : '';
  const v = Math.abs(x);
  if (v >= 1e9) return sign + '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return sign + '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e5 && opts.compact) return sign + '$' + (v / 1e3).toFixed(0) + 'k';
  if (v < 1) return sign + '$' + v.toFixed(2);
  if (v < 100) return sign + '$' + v.toFixed(2);
  return sign + '$' + Math.round(v).toLocaleString('en-US');
}
export const fmtPct = (x, d = 0) => (x * 100).toFixed(d) + '%';
export const fmtX = (x) => x.toFixed(2) + 'x';
