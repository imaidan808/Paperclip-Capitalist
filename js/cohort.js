// The "rest of the class". Three sources feed the Creativity Engine's niche volumes:
//   1. real peers (their published 48h niche counts),
//   2. a deterministic ghost cohort that behaves like a herd (so solo play still teaches saturation),
//   3. synthetic students, used for the instructor demo and as leaderboard filler.
import { ASSETS, BUYERS, ZONES, ZONE_IDS, PERK_IDS, TOTAL_DAYS, MIL } from './config.js';
import { fitOf, nicheKey, gini, demandOf } from './market.js';
import { hash, hash01 } from './rng.js';

// How busy a district's herd is: the starter districts are crowded, the far ones thin.
const rate = (z) => Math.max(0.08, 0.34 - 0.02 * (z - 1));
const classesIn = (z) => Object.keys(ASSETS).filter((c) => demandOf(ASSETS[c], z) > 0);
const buyersIn = (z) => Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z);

/** The herd climbs the districts together: a bell that moves from district 1 towards district 16 over the run, and widens as players spread out. */
export function zoneShare(day, z) {
  const c = 1 + 14 * Math.pow(Math.min(1, day / 90), 0.9), sigma = 1.6 + day / 40;
  const w = (k) => Math.exp(-((k - c) ** 2) / (2 * sigma * sigma));
  let sum = 0;
  for (const k of ZONE_IDS) sum += w(k);
  return w(z) / sum;
}

/** Expected cohort-wide ghost volumes for one class in one zone over a 48 virtual-hour window. */
export function ghostCounts(seed, hour, zone, cls, n = 36) {
  if (!n || demandOf(ASSETS[cls], zone) <= 0) return { total: 0, byBuyer: {} };
  const day = hour / 24 + 1;
  const nCls = classesIn(zone).length || 1;
  const noise = 1 + 0.15 * Math.sin(hash01(seed + zone + cls + Math.floor(hour / 12)) * 6.28);
  const total = n * zoneShare(day, zone) * rate(zone) * 48 / nCls * noise;
  const bs = buyersIn(zone);
  const w = bs.map((b) => { const f = fitOf(cls, b); return f >= 0.2 ? (BUYERS[b].pop * f ** 3) ** 2 : 0; });
  const sw = w.reduce((a, b) => a + b, 0) || 1;
  // a "meta guide" drifts the herd toward a second-best niche for ten days at a time
  const bucket = Math.floor(day / 10), within = (day % 10) / 12;
  const cands = bs.filter((b, i) => fitOf(cls, b) >= 0.4 && w[i] < Math.max(...w) * 0.99);
  const meta = cands.length ? cands[hash(seed + cls + zone + bucket) % cands.length] : null;
  const mw = meta ? 0.35 * (1 - within) : 0;
  const byBuyer = {};
  bs.forEach((b, i) => { const p = (1 - mw) * (w[i] / sw) + (b === meta ? mw : 0); if (p > 0) byBuyer[b] = total * p; });
  return { total, byBuyer };
}

export class Cohort {
  constructor({ seed = 'ghost', ghosts = 36 } = {}) {
    this.seed = seed; this.ghosts = ghosts;
    this.peers = new Map(); // pid -> latest snapshot
    this.cache = new Map(); this.cacheHour = -1;
  }
  setPeers(list) { this.peers = new Map(list.map((p) => [p.pid, p])); this.cache.clear(); }
  upsert(snap) { this.peers.set(snap.pid, snap); this.cache.clear(); }
  /** Recompute-on-demand totals. The Data Refresh Loop calls this once a minute of real time. */
  refresh() { this.cache.clear(); }
  counts(hour, zone, cls) {
    const bucket = Math.floor(hour / 6);
    if (bucket !== this.cacheHour) { this.cache.clear(); this.cacheHour = bucket; }
    const k = zone + cls;
    if (this.cache.has(k)) return this.cache.get(k);
    const g = ghostCounts(this.seed, hour, zone, cls, this.ghosts);
    const out = { total: g.total, byBuyer: { ...g.byBuyer } };
    for (const p of this.peers.values()) {
      for (const [key, n] of Object.entries(p.niches || {})) {
        const [z, c, b] = key.split('|');
        if (+z === zone && c === cls) { out.total += n; out.byBuyer[b] = (out.byBuyer[b] || 0) + n; }
      }
    }
    this.cache.set(k, out);
    return out;
  }
  /** Every niche with volumes, for the instructor heat map and the player's Niche Radar. */
  allNiches(hour) {
    const rows = [];
    for (const z of ZONE_IDS) for (const cls of classesIn(z)) {
      const c = this.counts(hour, z, cls);
      for (const b of buyersIn(z)) if (fitOf(cls, b) >= 0.3) rows.push({ zone: z, cls, buyer: b, n: c.byBuyer[b] || 0, total: c.total, fit: fitOf(cls, b), key: nicheKey(z, cls, b) });
    }
    return rows;
  }
}

// ---------------------------------------------------------------- synthetic students
const STYLES = ['herd', 'creative', 'leveraged', 'cautious', 'idle'];
// Net-worth paths for synthetic students: days at which they pass the gates of districts 5, 9, 13 and 16.
const ANCH = {
  fast: (sp) => [[0, 0.1], [13 * sp, 1000], [30 * sp, 25000], [52 * sp, 250000], [84 * sp, 2.5e6], [118, 8e6]],
  steady: (sp) => [[0, 0.1], [18 * sp, 1000], [38 * sp, 25000], [66 * sp, 250000], [118, 1.5e6]],
  slow: (sp) => [[0, 0.1], [26 * sp, 1000], [52 * sp, 25000], [96 * sp, 120000], [118, 250000]],
};
function curve(anchors, day) {
  if (day <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [d0, v0] = anchors[i - 1], [d1, v1] = anchors[i];
    if (day <= d1) { const t = (day - d0) / (d1 - d0 || 1); return Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0))); }
  }
  return anchors[anchors.length - 1][1];
}
const dip = (day, from, len, depth) => (day < from || day > from + len ? 1 : 1 - depth * Math.sin(Math.PI * (day - from) / len));

export function makeSynth(count, seed = 'demo') {
  const out = [];
  const pool = ['Ledger', 'Margin', 'Arbitrage', 'Bullish', 'Quarterly', 'Venture', 'Hustle', 'Pivot', 'Float', 'Yield', 'Spread', 'Asset'];
  for (let i = 0; i < count; i++) {
    const r = (k) => hash01(seed + i + k);
    const pid = 'SYN-' + hash(seed + i).toString(36).slice(0, 4).toUpperCase();
    const path = r('p') < 0.3 ? 'fast' : r('p') < 0.75 ? 'steady' : 'slow';
    const perks = [PERK_IDS[Math.floor(r('a') * PERK_IDS.length)], PERK_IDS[Math.floor(r('b') * PERK_IDS.length)]];
    if (perks[1] === perks[0]) perks[1] = PERK_IDS[(PERK_IDS.indexOf(perks[0]) + 5) % PERK_IDS.length];
    const style = STYLES[Math.floor(r('s') * STYLES.length)];
    const sp = (style === 'creative' ? 0.78 : style === 'cautious' ? 1.25 : style === 'herd' ? 1.4 : 1.0) * (0.85 + r('v') * 0.35);
    const favored = [];
    for (let k = 0; k < 3; k++) {
      const z = style === 'herd' ? 1 + (k % 3) : 1 + Math.floor(r('z' + k) * 8);
      const cs = classesIn(z), cls = cs[Math.floor(r('c' + k) * cs.length)], bs = buyersIn(z).filter((b) => fitOf(cls, b) >= 0.4);
      const buyer = bs.length ? (style === 'creative' ? bs[bs.length - 1 - Math.floor(r('b' + k) * Math.min(2, bs.length))] : bs[0]) : buyersIn(z)[0];
      favored.push({ z, cls, buyer });
    }
    out.push({
      pid, handle: pool[Math.floor(r('h') * pool.length)] + '-' + (10 + Math.floor(r('n') * 89)), perks, style, sp,
      anchors: ANCH[path](sp), favored, idleFrom: 28 + Math.floor(r('i') * 30), synth: true,
    });
  }
  return out;
}

export function synthSnapshot(st, hour) {
  const day = hour / 24 + 1;
  let nw = curve(st.anchors, day);
  if (st.style === 'leveraged') nw *= dip(day, 45, 12, 0.42);
  if (st.style === 'herd') nw *= dip(day, 15, 6, 0.1) * dip(day, 45, 10, 0.15);
  if (st.style === 'cautious') nw *= dip(day, 45, 8, 0.03);
  if (st.style === 'creative') nw *= dip(day, 75, 6, 0.05);
  if (st.style === 'idle') nw = curve(st.anchors, Math.min(day, st.idleFrom));
  const start = ASSETS.paperclip.base;
  const staticDays = st.style === 'idle' && day > st.idleFrom ? day - st.idleFrom : 0;
  const niches = {};
  const volume = Math.round(2 + Math.min(day, 60) / 8 * (st.style === 'idle' ? 0.2 : 1));
  st.favored.forEach((f, k) => { niches[nicheKey(f.z, f.cls, f.buyer)] = Math.max(1, volume - k); });
  return {
    pid: st.pid, handle: st.handle, perks: st.perks, synth: true, style: st.style, hour,
    nw, cash: nw * 0.3, debt: st.style === 'leveraged' ? nw * 1.8 : nw * 0.2, startCap: start,
    pipelines: nw > MIL.m1 ? Math.min(12, 1 + Math.floor(Math.log10(nw / 1000)) * 2) : 0, lastAutoHour: hour - staticDays * 24,
    autoEligible: nw >= MIL.m1, niches, cmAvg: st.style === 'creative' ? 2.4 : st.style === 'herd' ? 0.55 : 1.4,
    p2p: st.style === 'creative' ? 3 : st.style === 'idle' ? 0 : 1, flags: { insolvent: false, exited: false },
    zones: Math.max(1, ...ZONE_IDS.filter((z) => nw >= ZONES[z].gate)),
    shockLog: [], hoursPlayed: Math.round(day * 0.22 * 10) / 10, skills: { ops: 2, growth: 2, fintech: 2 }, inventory: [],
  };
}

export function synthFlags(synth, hour) {
  const day = hour / 24 + 1, out = [];
  synth.slice(0, 3).forEach((s, i) => {
    const at = 12 + i * 21;
    if (day >= at) out.push({ h: at * 24, pid: s.pid, peer: synth[(i + 3) % synth.length]?.pid, variance: 0.9 + i * 0.35, note: 'Cash offer far above the asset baseline FMV' });
  });
  return out;
}

export function cohortStats(snaps, hour) {
  const real = snaps.filter((s) => !s.flags?.exited || s.nw > 0);
  const nws = snaps.map((s) => s.nw);
  const static3 = snaps.filter((s) => s.autoEligible && (hour - (s.lastAutoHour ?? hour)) / 24 > 3);
  return { n: snaps.length, gini: gini(nws), alertGini: gini(nws) > 0.65, median: median(nws), static3, real };
}
export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const DEMO_DAYS = TOTAL_DAYS;
