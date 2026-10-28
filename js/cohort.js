// The "rest of the class". Three sources feed the Creativity Engine's niche volumes:
//   1. real peers (their published 48h niche counts),
//   2. a deterministic ghost cohort that behaves like a herd (so solo play still teaches saturation),
//   3. synthetic students, used for the instructor demo and as leaderboard filler.
import { ASSETS, BUYERS, ZONES, ZONE_IDS, PERK_IDS, PERKS, TOTAL_DAYS, TOTAL_HOURS, MIL, EEI_FLOOR_DEFAULT, SWAPS } from './config.js';
import { fitOf, nicheKey, gini, demandOf, truthMult } from './market.js';
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
    this.idx = null;        // zone|class -> what the real peers add, built once per change of peers instead of once per question
  }
  setPeers(list) { this.peers = new Map(list.map((p) => [p.pid, p])); this.cache.clear(); this.idx = null; }
  upsert(snap) { this.peers.set(snap.pid, snap); this.cache.clear(); this.idx = null; }
  remove(pid) { if (this.peers.delete(pid)) { this.cache.clear(); this.idx = null; } }
  /** Recompute-on-demand totals. The Data Refresh Loop calls this once a minute of real time. */
  refresh() { this.cache.clear(); }
  /** One pass over every peer's published niches. A count that is not a finite positive number is not a count (it would poison every classmate's prices). */
  _peerIndex() {
    if (this.idx) return this.idx;
    const idx = new Map();
    for (const p of this.peers.values()) {
      const niches = p && p.niches;
      if (!niches || typeof niches !== 'object') continue;
      for (const key of Object.keys(niches)) {
        const n = niches[key];
        if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
        const [z, c, b] = key.split('|');
        if (b === undefined || b === '__proto__') continue;
        const k = +z + '|' + c;
        let e = idx.get(k);
        if (!e) idx.set(k, (e = { total: 0, byBuyer: Object.create(null) }));
        e.total += n; e.byBuyer[b] = (e.byBuyer[b] || 0) + n;
      }
    }
    return (this.idx = idx);
  }
  counts(hour, zone, cls) {
    const bucket = Math.floor(hour / 6);
    if (bucket !== this.cacheHour) { this.cache.clear(); this.cacheHour = bucket; }
    const k = zone + cls;
    if (this.cache.has(k)) return this.cache.get(k);
    const g = ghostCounts(this.seed, bucket * 6, zone, cls, this.ghosts); // the bucket's own start, so a restored or rewound game sees what an uninterrupted one saw
    const out = { total: g.total, byBuyer: { ...g.byBuyer } };
    const add = this._peerIndex().get(zone + '|' + cls);
    if (add) { out.total += add.total; for (const b of Object.keys(add.byBuyer)) out.byBuyer[b] = (out.byBuyer[b] || 0) + add.byBuyer[b]; }
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

// ---------------------------------------------------------------- peer message hygiene
// Everything that arrives from the network is untrusted (docs/ARCHITECTURE.md: clients are trusted to play, not to be listened to without checking).
// These rebuild a message from a whitelist of fields with finite, clamped values, so one hostile or broken client cannot put a NaN, a negative crowd or a
// thousand phantom classmates into anybody else's game. They are pure and total: a bad input gives null or an empty value, never a throw.
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/** A finite number clamped to [lo, hi]; anything else (a string, NaN, null) becomes the default. +-Infinity is clamped to the bound. */
export const num = (x, lo, hi, d = lo) => (typeof x === 'number' && !Number.isNaN(x) ? Math.min(hi, Math.max(lo, x)) : d);
const int = (x, lo, hi, d = lo) => Math.floor(num(x, lo, hi, d));
/** Printable text of at most n characters (aliases are typed by students and shown to the whole class). */
export const text = (x, n = 24) => (typeof x === 'string' ? x.replace(/[\x00-\x1f\x7f]/g, '').slice(0, n) : '');
const ID = /^[\w.@:-]{1,48}$/;
/** A pid, offer id or asset id: short, no spaces or markup. */
export const cleanId = (x) => (typeof x === 'string' && ID.test(x) ? x : null);

// What an honest founder publishes (the heuristic bot, which plays far more than a person, with managers, over 90 days; measured again after the managers were mended, 2026-10-28): at most 46 niches, 8 sales in one
// in a 48-hour window, 102 in all. The caps are a half again as much. A classmate who lies is still believed up to them, which is not nothing: one cheat claiming 12 sales in a lane takes a pioneer niche (Cm 3.1)
// to a crowded one (about 0.9), though no longer to the 0.40 floor that a claim of 60 pinned it to (claims of 20 to 60 all did). Everyone's counts are believed alike: weighting them down (a square root, say) would
// understate a real class crowding a lane, which is what the game teaches. The real fix is the one docs/ARCHITECTURE.md plans, aggregating the counts on a server.
export const NICHE_CAP = 80;    // keys a classmate may publish
export const NICHE_MAX = 12;    // one niche's 48-hour count
export const NICHE_TOTAL = 150; // all of a classmate's counts together
export const NW_LIMIT = 1e8;    // an honest strong run ends near $2e7 at the very most (docs/BALANCE.md: the 90th percentile is $2.3e6); nothing a classmate reports is believed beyond this
export const INV_CAP = 24;      // what publicSnapshot() shares
export const SIDE_CAP = 12;     // crates on one side of a swap

/** A classmate's published 48-hour niche counts: keep only keys that name a real district, class and buyer of that district, with a count that is a number. */
export function cleanNiches(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0, sum = 0;
  for (const key of Object.keys(raw)) {
    if (n >= NICHE_CAP || sum >= NICHE_TOTAL) break;
    const v = raw[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const parts = key.split('|');
    if (parts.length !== 3) continue;
    const z = +parts[0], c = parts[1], b = parts[2];
    if (!ZONE_IDS.includes(z) || !own(ASSETS, c) || !own(BUYERS, b) || BUYERS[b].zone !== z) continue;
    const k = Math.min(NICHE_MAX, NICHE_TOTAL - sum, Math.floor(v));
    if (k < 1) continue;
    out[nicheKey(z, c, b)] = k; n++; sum += k;
  }
  return out;
}

/** One crate as it travels between classmates. `fold` turns a hidden truth (a counterfeit, a condition) into plain quality, the way a swap discloses it: the truth itself never leaves. */
export function cleanAsset(a, { fold = false } = {}) {
  if (!isObj(a) || !own(ASSETS, a.cls)) return null;
  const id = cleanId(a.id);
  if (!id) return null;
  let quality = num(a.quality, 0.01, 2, 1);
  if (fold && isObj(a.truth)) quality = num(quality * truthMult({ truth: { fake: a.truth.fake === true, q: num(a.truth.q, 0.6, 1.2, 1) } }), 0.01, 2, 1);
  return { id, cls: a.cls, cond: a.cond === 'broken' ? 'broken' : 'ok', quality, wear: num(a.wear, 0, 1, 1), zone: ZONE_IDS.includes(a.zone) ? a.zone : 1, known: true };
}
const cleanPub = (a) => {
  const c = cleanAsset(a);
  if (!c) return null;
  delete c.known;
  c.fmv = num(a.fmv, 0, 1e10, 0); c.basis = num(a.basis, 0, 1e10, 0);
  return c;
};

/** A classmate's public snapshot, rebuilt: identity comes from the authenticated sender, never from the payload. */
export function cleanSnap(raw, from) {
  if (!isObj(raw) || !cleanId(from)) return null;
  const perks = Array.isArray(raw.perks) ? [...new Set(raw.perks.filter((id) => own(PERKS, id)))].slice(0, 2) : [];
  const sk = isObj(raw.skills) ? raw.skills : {};
  const fl = isObj(raw.flags) ? raw.flags : {};
  const mil = isObj(raw.mil) ? raw.mil : {};
  const shockLog = (Array.isArray(raw.shockLog) ? raw.shockLog : []).filter(isObj).slice(0, 12).map((x) => ({
    id: text(x.id, 40), nw: num(x.nw, -NW_LIMIT, NW_LIMIT, 0), nwAfter: typeof x.nwAfter === 'number' && Number.isFinite(x.nwAfter) ? num(x.nwAfter, -NW_LIMIT, NW_LIMIT) : null, pivots: int(x.pivots, 0, 999, 0), de: typeof x.de === 'number' && Number.isFinite(x.de) ? num(x.de, -1e6, 1e6) : null,
  })).filter((x) => x.id);
  const plays = {};
  if (isObj(raw.plays)) for (const k of ['inspect', 'pitch', 'haggle', 'repair', 'auction', 'quick', 'played']) if (typeof raw.plays[k] === 'number' && Number.isFinite(raw.plays[k])) plays[k] = num(raw.plays[k], 0, 1e6);
  const trades = int(raw.trades, 0, 1e5, 0);
  return {
    pid: from, handle: text(raw.handle), perks, specialty: ['ops', 'growth', 'fintech'].includes(raw.specialty) ? raw.specialty : null,
    skills: { ops: int(sk.ops, 0, 12, 1), growth: int(sk.growth, 0, 12, 1), fintech: int(sk.fintech, 0, 12, 1) },
    level: int(raw.level, 1, 99, 1), hour: num(raw.hour, 0, TOTAL_HOURS, 0),
    nw: num(raw.nw, -NW_LIMIT, NW_LIMIT, 0), cash: num(raw.cash, -NW_LIMIT, NW_LIMIT, 0), debt: num(raw.debt, 0, NW_LIMIT, 0), startCap: ASSETS.paperclip.base,
    eei: num(raw.eei, -1e12, 1e12, 0), // what they say; the session recomputes it unless the run is over
    zones: int(raw.zones, 1, ZONE_IDS.length, 1), pipelines: int(raw.pipelines, 0, 999, 0), lastAutoHour: num(raw.lastAutoHour, 0, TOTAL_HOURS, 0), autoEligible: raw.autoEligible === true,
    niches: cleanNiches(raw.niches), cmAvg: num(raw.cmAvg, 0, 5, 0),
    trades, p2p: Math.min(int(raw.p2p, 0, 1e5, 0), trades, SWAPS.perDay * (Math.floor(num(raw.hour, 0, TOTAL_HOURS, 0) / 24) + 1)), // a swap is a trade, and the engine counts at most SWAPS.perDay a day: more is not possible
    flags: { insolvent: fl.insolvent === true, exited: fl.exited === true, over: fl.over === true },
    shockLog, hoursPlayed: num(raw.hoursPlayed, 0, TOTAL_DAYS, 0), auditFail: int(raw.auditFail, 0, 999, 0),
    inventory: (Array.isArray(raw.inventory) ? raw.inventory : []).slice(0, INV_CAP).map(cleanPub).filter(Boolean),
    mil: { m1: mil.m1 === true, m2: mil.m2 === true, m3: mil.m3 === true }, plays,
  };
}

/** The slice of the shared difficulty a classroom may tune. Out-of-range numbers are clamped, wrong types are ignored. */
export function cleanDifficulty(d) {
  const out = {};
  if (!isObj(d)) return out;
  if (typeof d.friction === 'number' && !Number.isNaN(d.friction)) out.friction = num(d.friction, 0.5, 3);
  if (typeof d.audit === 'number' && !Number.isNaN(d.audit)) out.audit = num(d.audit, 0.5, 3);
  if (typeof d.eeiFloor === 'number' && !Number.isNaN(d.eeiFloor)) out.eeiFloor = num(d.eeiFloor, 0.01, 1e9);
  return out;
}
export const DEFAULT_DIFFICULTY = () => ({ friction: 1, audit: 1, eeiFloor: EEI_FLOOR_DEFAULT });

/** The instructor's clock message. Hour, speed and paused must be right or the message is dropped whole; the tunables are clamped. */
export function cleanClock(m) {
  if (!isObj(m)) return null;
  if (typeof m.hour !== 'number' || !Number.isFinite(m.hour) || m.hour < 0 || m.hour > TOTAL_HOURS + 1) return null;
  if (typeof m.speed !== 'number' || !Number.isFinite(m.speed) || m.speed < 0.001 || m.speed > 64) return null;
  if (typeof m.paused !== 'boolean') return null;
  const c = { hour: Math.min(m.hour, TOTAL_HOURS), speed: m.speed, paused: m.paused, age: num(m.age, 0, 10000, 0) };
  if (m.difficulty !== undefined) c.difficulty = cleanDifficulty(m.difficulty);
  if (typeof m.ghosts === 'number' && !Number.isNaN(m.ghosts)) c.ghosts = Math.round(num(m.ghosts, 0, 200));
  if (typeof m.algo === 'boolean') c.algo = m.algo;
  return c;
}

/** An instructor-injected shock: a known kind, a string id, a finite start. Returns null for anything else. */
export function cleanInject(m, now) {
  if (!isObj(m) || typeof m.kind !== 'string' || m.kind.length > 40) return null;
  if (m.id !== undefined && cleanId(m.id) === null) return null;
  if (typeof m.atHour !== 'number' || !Number.isFinite(m.atHour)) return null;
  return { kind: m.kind, atHour: Math.min(TOTAL_HOURS, Math.max(now, Math.floor(m.atHour))), id: m.id, replace: m.replace === true, cls: own(ASSETS, m.cls) ? m.cls : undefined };
}

/**
 * A swap invitation as it arrives: only what createOffer() ever writes. `want.assets` keep just their ids (the receiver swaps in the crates it really holds, so
 * nobody can price a crate it does not own), a royalty is a promise from the proposer only, and every number is finite and bounded.
 */
export function cleanOffer(o, from, to) {
  if (!isObj(o)) return null;
  const id = cleanId(o.id);
  if (!id || o.from !== from || o.to !== to || !isObj(o.give) || !isObj(o.want)) return null;
  if (o.want.royalty != null) return null; // createOffer never writes one and acceptOffer never charges it: it can only be a padding of the fair-value check
  const give = { assets: [], cash: num(o.give.cash, 0, 1e10, 0), royalty: null };
  if (!Array.isArray(o.give.assets) || o.give.assets.length > SIDE_CAP) return null;
  for (const a of o.give.assets) { const c = cleanAsset(a); if (!c) return null; give.assets.push(c); }
  if (o.give.royalty != null) {
    if (!isObj(o.give.royalty)) return null;
    const perDay = num(o.give.royalty.perDay, 0, 1e9, 0), days = int(o.give.royalty.days, 1, TOTAL_DAYS, 0);
    if (perDay > 0 && days > 0) give.royalty = { perDay, days };
  }
  const want = { assets: [], cash: num(o.want.cash, 0, 1e10, 0) };
  if (!Array.isArray(o.want.assets) || o.want.assets.length > SIDE_CAP) return null;
  for (const w of o.want.assets) {
    const wid = isObj(w) ? cleanId(w.id) : null;
    if (!wid) return null;
    want.assets.push({ id: wid, cls: isObj(w) && own(ASSETS, w.cls) ? w.cls : undefined });
  }
  const sk = isObj(o.skills) ? o.skills : {};
  // the promiser's net worth as they report it: the engine values a promised royalty by it (and at nothing when it is absent), so it must get through the door, as a real clamped number or not at all
  const nw = typeof o.nw === 'number' && Number.isFinite(o.nw) ? { nw: num(o.nw, -NW_LIMIT, NW_LIMIT, 0) } : {};
  return {
    id, from, fromHandle: text(o.fromHandle), to, at: num(o.at, 0, TOTAL_HOURS, 0), note: text(o.note, 140), give, want, ...nw,
    skills: { ops: int(sk.ops, 0, 12, 1), growth: int(sk.growth, 0, 12, 1), fintech: int(sk.fintech, 0, 12, 1) },
  };
}
