// The simulation engine. Pure JS, no DOM. One step = one virtual hour; 24 hours = 1 virtual day; 90 days = a run.
// Every student-facing action is a method that returns {ok, msg, ...}. Everything the UI shows is read from `game.s`.
import {
  TOTAL_DAYS, TOTAL_HOURS, MIL, CM, FEES, FMV_BAND, EEI_FLOOR_DEFAULT, BASE_RATE, DEBT, ZONES, SKILLS, SKILL_MAX, trainCost,
  PROFILES, ASSETS, BUYERS, PIPE, PIPE_RULES, UPGRADES, CLIENTS, LOANS, AUDIT_THEMES, AUDIT, EVENTS, ALGO_EVENTS, WARN_LEAD, FRESH,
} from './config.js';
import {
  clamp, creativity, creativityBand, saturation, eei as eeiCalc, fmvVariance, restoreQuality, repairCostFor, fitOf, fitMult,
  nicheKey, assetFMV, demandMult, priceMult, speedMult, obviousBuyer, utilityIn,
} from './market.js';
import { step as rngStep, hash01 } from './rng.js';

const ok = (msg, extra = {}) => ({ ok: true, msg, ...extra });
const fail = (msg, extra = {}) => ({ ok: false, msg, ...extra });
const money = (x) => (Math.abs(x) < 100 ? '$' + x.toFixed(2) : '$' + Math.round(x).toLocaleString('en-US'));

export class Game {
  constructor(opts = {}) {
    this.env = { cohort: null, difficulty: { friction: 1, audit: 1, eeiFloor: EEI_FLOOR_DEFAULT }, worldSeed: opts.worldSeed || 'solo', algo: true };
    this.ckpt = new Map();
    this.out = [];
    this.onNote = null;
    this._m = null;
    this.s = opts.state || this._new(opts);
  }

  // ------------------------------------------------------------------ construction
  _new({ profile = 'bootstrapper', handle = 'Founder', pid = 'PC-' + Math.random().toString(36).slice(2, 6).toUpperCase(), seed, specialty = 'ops', startHour = 0 }) {
    const P = PROFILES[profile];
    seed = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
    const skills = { ops: 1, growth: 1, fintech: 1 };
    skills[specialty] = 3;
    const s = {
      v: 1, pid, handle, profile, specialty, seed, rng: seed, startHour, hour: startHour,
      cash: P.cash, startCapital: P.startCapital, skills, xp: 0, streak: 0, bestStreak: 0,
      zones: [...P.zones], mil: { m1: false, m2: false, m3: false }, nid: 1,
      assets: [], leads: { 1: [], 2: [], 3: [] }, lots: { 1: [], 2: [], 3: [] },
      pool: { 1: ZONES[1].pool, 2: ZONES[2].pool, 3: ZONES[3].pool },
      pipes: [], upg: {}, clients: [], loans: [], settle: [], freight: [], escrow: [], royalties: [],
      events: [], alertsSeen: {}, auditPending: null, auditNext: null, auditFirst: false, auditFail: 0, auditPass: 0, auditIgnored: 0, velPenalty: 1,
      ledger: [], news: [], niche: [], shockLog: [], pivot: 0, acc: { profit: 0 }, dp: [], lastAuto: startHour, trades: 0, p2p: 0, cm: { sum: 0, n: 0 },
      insolvent: false, exiting: null, exit: null, over: false, peak: P.cash, entOpened: false, overdraft: 0, hist: [],
    };
    for (const a of P.assets) s.assets.push(this._mk(s, a.cls, { zone: P.startZone, basis: ASSETS[a.cls].base }));
    for (const [id, def] of Object.entries(EVENTS)) {
      const start = (def.day - 1) * 24;
      if (start >= startHour) s.events.push(this._evInstance(id, start));
    }
    this.s = s;
    for (let i = 0; i < 4; i++) for (const z of s.zones) { this._spawnLead(z); this._spawnLot(z); }
    if (s.assets.length) this._spawnLead(P.startZone, false, true);
    this._unlock();
    this._checkpoint();
    return s;
  }
  _mk(s, cls, o = {}) {
    return { id: 'A' + s.nid++, cls, cond: o.cond || 'ok', quality: o.quality ?? 1, wear: 1, zone: o.zone ?? 1, basis: o.basis ?? 0, from: o.from || 'start', got: s.hour };
  }
  _evInstance(kind, start, extra = {}) {
    const d = EVENTS[kind];
    return { id: extra.id || `${kind}@${start}`, kind, name: d.name, start, phases: d.phases, level: d.level, alert: d.alert, short: d.short, warned: false, started: false, ...extra };
  }

  // ------------------------------------------------------------------ small helpers
  get P() { return PROFILES[this.s.profile]; }
  get day() { return Math.min(TOTAL_DAYS, Math.floor(this.s.hour / 24) + 1); }
  daysRemaining() { return Math.max(0, TOTAL_DAYS - this.s.hour / 24); }
  rand() { const [n, v] = rngStep(this.s.rng); this.s.rng = n; return v; }
  lvl(k) { return this.s.skills[k]; }
  note(level, text, extra = {}) {
    const n = { h: this.s.hour, level, text, ...extra };
    this.s.news.unshift(n);
    if (this.s.news.length > 80) this.s.news.length = 80;
    this.onNote?.(n);
  }
  led(type, text, amt = 0, meta = {}) {
    const L = this.s.ledger;
    L.push({ h: this.s.hour, type, text, amt, ...meta });
    if (L.length > 3200) { const i = L.findIndex((e) => e.type === 'pipe'); L.splice(i < 0 ? 0 : i, 1); }
  }
  xp(n) { this.s.xp += Math.round(n); }
  level() { return Math.floor(Math.sqrt(this.s.xp / 100)) + 1; }

  mods() {
    if (this._m && this._m.h === this.s.hour) return this._m;
    const m = { h: this.s.hour, demand: [], price: [], speed: [], fee: 0, rateBps: 0, overhead: 1, repair: 1, intlSlow: 0, freeze: false };
    for (const ev of this.s.events) {
      const t = this.s.hour - ev.start;
      if (t < 0) continue;
      for (const ph of ev.phases) {
        if (t < ph.from || t >= ph.to) continue;
        const e = ph.eff;
        if (e.demand) m.demand.push(e.demand);
        if (e.price) m.price.push(e.price);
        if (e.speed) m.speed.push(e.speed);
        if (e.fee) m.fee += e.fee;
        if (e.rateBps) m.rateBps += e.rateBps;
        if (e.overhead) m.overhead *= e.overhead;
        if (e.repair) m.repair *= e.repair;
        if (e.intlSlow) m.intlSlow += e.intlSlow;
        if (e.freeze) m.freeze = true;
      }
    }
    return (this._m = m);
  }
  crowd(cls, zone) {
    const c = this.env.cohort?.counts(this.s.hour, zone, cls);
    return c ? 1 - 0.4 * Math.min(1, c.total / 220) : 1;
  }
  val(a, zone = a.zone) { return assetFMV(a, zone, this.mods(), this.crowd(a.cls, zone)); }
  fintechMult() { return Math.max(0.5, 1 - 0.06 * (this.lvl('fintech') - 1)); }
  instFee(channel) {
    if (channel === 'p2p') return 0;
    if (this.P.feeFree && channel === 'pitch') return 0;
    return (FEES.base + this.mods().fee) * this.fintechMult() * this.env.difficulty.friction;
  }
  zoneTax(z) { return (ZONES[z].tax + (z >= 2 ? this.P.taxAdd || 0 : 0)) * this.env.difficulty.friction; }
  liqDelay(zone) { return Math.max(this.P.liqDelay || 0, zone === 3 ? 48 : 0); }
  loanRate(prod) { return (BASE_RATE + this.mods().rateBps / 10000 + LOANS[prod].spread) * Math.max(0.45, 1 - 0.07 * (this.lvl('fintech') - 1)); }
  debt() { return this.s.loans.reduce((a, l) => a + l.principal + l.accr, 0); }
  invValue() { return this.s.assets.reduce((a, x) => a + this.val(x), 0); }

  netWorth() {
    const s = this.s;
    let v = s.cash;
    for (const a of s.assets) v += this.val(a);
    for (const f of s.freight) for (const a of f.items) v += this.val(a, f.to);
    for (const e of s.escrow) { v += e.cash || 0; for (const a of e.assets) v += this.val(a); }
    for (const x of s.settle) v += x.amt;
    for (const p of s.pipes) v += p.basis + (p.inflight || 0);
    return v - this.debt();
  }
  deRatio() { const nw = this.netWorth(); return nw <= 0 ? (this.debt() > 0 ? Infinity : 0) : this.debt() / nw; }
  eei() {
    if (this.s.exit) return this.s.exit.eei;
    return eeiCalc(this.netWorth(), this.s.startCapital, this.daysRemaining(), this.env.difficulty.eeiFloor);
  }
  creativityScore() { const c = this.s.cm; return c.n ? clamp(((c.sum / c.n) - CM.min) / (CM.max - CM.min), 0, 1) * 100 : 0; }

  // ------------------------------------------------------------------ time
  advanceTo(hourFloat) {
    let n = 0;
    const target = Math.min(TOTAL_HOURS, Math.floor(hourFloat));
    while (this.s.hour < target && !this.s.over) { this.stepHour(); if (++n > 4000) break; }
    if (this.s.hour >= TOTAL_HOURS && !this.s.over) this._finish();
    return n;
  }
  _finish() {
    const s = this.s;
    s.over = true;
    this.note('info', 'Day 90. The clearing horizon has closed. Open the debrief to see your Economic Efficiency Index.', { final: true });
  }

  stepHour() {
    const s = this.s;
    s.hour++;
    this._m = null;
    this._events();
    this._unlock();
    for (const z of s.zones) { this._spawnLead(z, true); this._spawnLot(z, true); }
    for (const z of [1, 2, 3]) s.pool[z] = Math.min(ZONES[z].pool, s.pool[z] + ZONES[z].pool * 0.35 / 24);
    this._settlements();
    this._freight();
    this._pipelines();
    this._escrowExpiry();
    if (s.exiting && s.hour >= s.exiting.at) this._finishExit();
    if (s.hour % 24 === 0) this._dayTick();
    this._audits();
    this._marginCall();
    const nw = this.netWorth();
    if (nw > s.peak) s.peak = nw;
    s.insolvent = nw <= 0 && !s.exit;
  }

  // ------------------------------------------------------------------ milestones, events
  _unlock() {
    const s = this.s, nw = this.netWorth();
    if (!s.mil.m1 && nw >= MIL.m1) {
      s.mil.m1 = true;
      if (!s.zones.includes(2)) { s.zones.push(2); this._spawnLead(2); this._spawnLot(2); }
      this.note('good', 'Milestone 1: $1,000 net worth. The Metro Hub and the Commercial Bank are open.', { milestone: 1 });
    }
    if (!s.mil.m2 && nw >= MIL.m2) {
      s.mil.m2 = true;
      s.auditNext = s.hour;
      this.note('warn', 'Milestone 2: $25,000 net worth. A mandatory Regulatory Audit is coming. Automation expansion is locked until you file.', { milestone: 2 });
    }
    if (!s.mil.m3 && nw >= MIL.m3) {
      s.mil.m3 = true;
      if (!s.zones.includes(3)) { s.zones.push(3); this._spawnLead(3); this._spawnLot(3); }
      this.note('good', 'Milestone 3: $250,000 net worth. Corporate Valley is open: enterprise clients, M&A and IPO preparation.', { milestone: 3 });
    }
  }
  warnLead() {
    const f = this.lvl('fintech') + (this.s.upg.research ? 2 : 0);
    return f >= 5 ? WARN_LEAD.adv : f >= 3 ? WARN_LEAD.mid : WARN_LEAD.novice;
  }
  _events() {
    const s = this.s, h = s.hour;
    for (const ev of s.events) {
      const lead = this.warnLead();
      if (!ev.warned && h < ev.start && h >= ev.start - lead) {
        ev.warned = true; ev.warnedAt = h;
        const hrs = ev.start - h;
        this.note('warn', `${ev.name}: effective in ${hrs >= 24 ? Math.round(hrs / 24) + ' days' : hrs + ' hours'}.`, { alert: { ...ev.alert, name: ev.name, level: ev.level, start: ev.start } });
      }
      if (!ev.started && h >= ev.start) {
        ev.started = true;
        if (!ev.warned) { ev.warned = true; ev.warnedAt = h; this.note('bad', `BREAKING: ${ev.name} is live now.`, { alert: { ...ev.alert, name: ev.name, level: ev.level, start: ev.start } }); }
        else this.note('bad', `${ev.name} is now in effect.`);
        s.shockLog.push({ id: ev.id, kind: ev.kind, name: ev.name, start: h, nw: this.netWorth(), cash: s.cash, debt: this.debt(), de: this.deRatio(), inv: this.invValue(), pipes: s.pipes.length, intl: s.pipes.filter((p) => p.channel === 'intl').length, pivot0: s.pivot, nwAfter: null, pivots: null, warnedHours: ev.start - (ev.warnedAt ?? ev.start) });
        this._m = null;
      }
      if (ev.kind === 'tiktok' && h === ev.start + 48) this.note('bad', 'Market fatigue: trend goods lose half their value for 72 hours.');
    }
    for (const sh of s.shockLog) if (sh.nwAfter == null && h >= sh.start + 120) { sh.nwAfter = this.netWorth(); sh.pivots = s.pivot - sh.pivot0; }
  }
  /** Instructor-injected or algorithmic shock. Idempotent on id. */
  injectEvent(kind, atHour, extra = {}) {
    const id = extra.id || `${kind}@${atHour}`;
    if (this.s.events.some((e) => e.id === id)) return false;
    if (extra.replace) this.s.events = this.s.events.filter((e) => !(e.kind === kind && !e.started));
    let inst;
    if (EVENTS[kind]) inst = this._evInstance(kind, atHour, { id, injected: !!extra.injected || !!extra.replace });
    else if (ALGO_EVENTS[kind]) {
      const made = ALGO_EVENTS[kind].mk(extra.cls || 'sneakers');
      inst = { id, kind, name: made.name, start: atHour, phases: made.phases, level: 1, alert: { code: 'ALGO-' + kind.toUpperCase(), readout: made.name + '.', vars: [], enforcement: 'Algorithmic market event.' }, warned: false, started: false, short: 'Algorithmic' };
    } else return false;
    this.s.events.push(inst);
    this._m = null;
    return true;
  }
  _algoEvent(day) {
    if (!this.env.algo || day < 4 || day > 86) return;
    const near = this.s.events.some((e) => !e.id.startsWith('algo') && Math.abs((e.start / 24 + 1) - day) < 3);
    if (near || hash01(this.env.worldSeed + 'algo' + day) > 0.14) return;
    const kinds = Object.keys(ALGO_EVENTS), kind = kinds[Math.floor(hash01(this.env.worldSeed + 'k' + day) * kinds.length)];
    const classes = Object.keys(ASSETS).filter((c) => ASSETS[c].base < 100000);
    const cls = classes[Math.floor(hash01(this.env.worldSeed + 'c' + day) * classes.length)];
    this.injectEvent(kind, (day - 1) * 24 + 8, { id: 'algo-' + day, cls });
  }

  // ------------------------------------------------------------------ markets
  _spawnLead(z, byClock = false, force = false) {
    const s = this.s, Z = ZONES[z];
    s.leads[z] = s.leads[z].filter((l) => l.exp > s.hour);
    if (byClock) {
      const mult = (1 + 0.15 * (this.lvl('growth') - 1)) * (s.upg.seo ? 1.5 : 1) * (this.P.leadMult || 1);
      const every = Math.max(1, Math.round(Z.leadEvery / mult));
      if (s.hour % every !== 0) return;
    }
    if (s.leads[z].length >= 8) return;
    const segs = Object.keys(BUYERS).filter((id) => BUYERS[id].zone === z);
    let seg = this._weighted(segs, (id) => BUYERS[id].pop + 0.25), need = null, budget = null;
    const mine = s.assets.filter((a) => a.zone === z && a.cond === 'ok');
    if ((force || this.rand() < Z.urgent) && mine.length) {
      const a = mine[Math.floor(this.rand() * mine.length)];
      const cand = segs.filter((id) => fitOf(a.cls, id) >= 0.45);
      if (cand.length) {
        seg = cand[Math.floor(this.rand() * cand.length)];
        need = ASSETS[a.cls].tags.slice().sort((x, y) => (BUYERS[seg].like[y] || 0) - (BUYERS[seg].like[x] || 0))[0];
        const fmv = this.val(a);
        budget = fmv < 2 ? 3 + this.rand() * 12 : fmv * (1.4 + this.rand() * 2.2);
      }
    }
    const B = BUYERS[seg];
    if (budget == null) budget = B.budget[0] + (B.budget[1] - B.budget[0]) * this.rand() ** 3;
    budget = clamp(budget, B.budget[0], B.budget[1]);
    s.leads[z].push({ id: 'L' + s.nid++, zone: z, seg, budget: Math.round(budget * 100) / 100, need, born: s.hour, exp: s.hour + 18 + Math.floor(this.rand() * 19) });
  }
  _weighted(items, wf) {
    const ws = items.map(wf);
    let r = this.rand() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  _spawnLot(z, byClock = false) {
    const s = this.s, Z = ZONES[z];
    s.lots[z] = s.lots[z].filter((l) => l.exp > s.hour);
    if (byClock && s.hour % Z.lotEvery !== 0) return;
    if (s.lots[z].length >= 6) return;
    const nw = Math.max(10, this.netWorth());
    const classes = Object.keys(ASSETS).filter((c) => {
      const d = ASSETS[c];
      if (d.dem[z - 1] <= 0) return false;
      const v = d.base * 0.8;
      if (z === 1) return v <= Math.max(25, nw * 8);
      if (z === 2) return v >= 60 && v <= Math.max(2000, nw * 6);
      return v >= 3000 && v <= Math.max(60000, nw * 6);
    });
    if (!classes.length) return;
    const cls = classes[Math.floor(this.rand() * classes.length)], def = ASSETS[cls];
    const cond = def.repair && this.rand() < 0.5 ? 'broken' : 'ok';
    const asset = { cls, cond, quality: 1, wear: 1 };
    const asIs = assetFMV(asset, z, this.mods(), this.crowd(cls, z));
    const ops = this.lvl('ops');
    const disc = cond === 'ok' ? Math.max(0.78, 0.95 - 0.025 * (ops - 1)) : Math.max(0.8, 1 - 0.03 * (ops - 1));
    s.lots[z].push({ id: 'T' + s.nid++, zone: z, cls, cond, price: Math.max(0.01, Math.round(asIs * disc * 100) / 100), exp: s.hour + 24 + Math.floor(this.rand() * 24) });
  }
  ownCounts(zone, cls) {
    const out = { total: 0, byBuyer: {} }, from = this.s.hour - 48;
    for (const [h, z, c, b] of this.s.niche) if (h > from && z === zone && c === cls) { out.total++; out.byBuyer[b] = (out.byBuyer[b] || 0) + 1; }
    return out;
  }
  cmFor(zone, cls, seg) {
    const c = this.env.cohort?.counts(this.s.hour, zone, cls) || { total: 0, byBuyer: {} };
    const own = this.ownCounts(zone, cls);
    const vT = c.total + own.total, vN = (c.byBuyer[seg] || 0) + (own.byBuyer[seg] || 0);
    const cm = creativity(vN, vT);
    return { cm, S: saturation(vN, vT), vN, vT, band: creativityBand(cm), key: nicheKey(zone, cls, seg) };
  }
  logNiche(zone, cls, seg, cm) {
    this.s.niche.push([this.s.hour, zone, cls, seg]);
    if (seg !== 'npc-pool') { this.s.cm.sum += cm; this.s.cm.n++; }
  }
  /** Every underserved niche in a zone, best first (the Market Research "Niche Radar"). */
  radar(zone, limit = 6) {
    const rows = [];
    for (const cls of Object.keys(ASSETS)) {
      if (ASSETS[cls].dem[zone - 1] <= 0) continue;
      for (const seg of Object.keys(BUYERS)) {
        if (BUYERS[seg].zone !== zone) continue;
        const fit = fitOf(cls, seg);
        if (fit < 0.5) continue;
        const c = this.cmFor(zone, cls, seg);
        rows.push({ cls, seg, fit, ...c, score: c.cm * fitMult(fit) });
      }
    }
    return rows.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ------------------------------------------------------------------ manual trading
  growthMult() { return 1 + 0.04 * (this.lvl('growth') - 1); }
  quotePitch(assetId, leadId) {
    const s = this.s, a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail('Pick an asset from your inventory.');
    let lead = null;
    for (const z of s.zones) lead = lead || s.leads[z].find((l) => l.id === leadId);
    if (!lead) return fail('That buyer has left.');
    if (a.zone !== lead.zone) return fail(`Your ${ASSETS[a.cls].name} is in ${ZONES[a.zone].short}. Freight it to ${ZONES[lead.zone].short} first.`);
    const def = ASSETS[a.cls], z = lead.zone;
    if (def.dem[z - 1] <= 0) return fail(`Nobody in ${ZONES[z].short} wants ${def.name}.`);
    if (a.cond === 'broken' && !['mechanic', 'scrapper'].includes(lead.seg)) return fail('Buyers will not take a broken asset. Repair it first, or sell to a mechanic or scrap broker.');
    let fit = fitOf(a.cls, lead.seg);
    if (lead.need) fit = def.tags.includes(lead.need) ? 1 : fit * 0.5;
    const ci = this.cmFor(z, a.cls, lead.seg);
    const fmv = this.val(a);
    const B = BUYERS[lead.seg];
    const ref = lead.need ? lead.budget : fmv;
    const term = lead.need ? 0.55 + 0.45 * fit : fitMult(fit);
    const hustle = this.P.valueMult || 1;
    const rejected = fit < 0.15;
    let price = rejected ? 0 : ref * term * CM.pitchBase * ci.cm * this.growthMult() * hustle;
    const capped = price > lead.budget;
    price = Math.min(price, lead.budget);
    const tax = this.zoneTax(z), fee = this.instFee('pitch');
    const net = price * (1 - tax - fee);
    let goods = null, change = net;
    if (!rejected && z === 1 && B.holds) {
      let best = null;
      for (const h of B.holds) {
        if (h.cls === a.cls) continue; // a buyer will not hand back the very thing you just sold them
        const v = assetFMV({ cls: h.cls, cond: h.cond || 'ok', quality: 1, wear: 1 }, z, this.mods(), this.crowd(h.cls, z));
        if (v <= net && v > 0 && (!best || v > best.value)) best = { cls: h.cls, cond: h.cond || 'ok', value: v };
      }
      if (best && best.value >= 0.02) { goods = best; change = net - best.value; }
    }
    const received = (goods ? goods.value : 0) + change;
    return {
      ok: true, rejected, fit, fmv, ci, price, capped, tax, fee, net, goods, change, received, lead, asset: a, zone: z, mods: this.mods(),
      gain: fmv > 0 ? received / fmv - 1 : 0, profit: received - (a.basis || 0), parts: { ref, term, base: CM.pitchBase, cm: ci.cm, growth: this.growthMult(), hustle },
    };
  }
  pitch(assetId, leadId) {
    const q = this.quotePitch(assetId, leadId);
    if (!q.ok) return q;
    const s = this.s, a = q.asset, z = q.zone;
    s.leads[z] = s.leads[z].filter((l) => l.id !== leadId);
    s.trades++;
    if (q.rejected) {
      s.streak = 0;
      this.led('pitch', `Pitched ${ASSETS[a.cls].name} to ${BUYERS[q.lead.seg].name}: rejected (no fit).`, 0, { z });
      return ok('Trade rejected.', { ...q, outcome: 'rejected' });
    }
    s.assets = s.assets.filter((x) => x.id !== a.id);
    this.logNiche(z, a.cls, q.lead.seg, q.ci.cm);
    s.lastAuto = s.hour;
    let got = '';
    if (q.goods) {
      const g = this._mk(s, q.goods.cls, { cond: q.goods.cond, zone: z, basis: q.goods.value, from: 'barter' });
      s.assets.push(g);
      got = ASSETS[g.cls].name + (g.cond === 'broken' ? ' (broken)' : '');
    }
    s.cash += q.change;
    const win = q.received > q.fmv * 1.02;
    s.streak = win ? s.streak + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    const xp = win ? 40 + 60 * clamp(Math.log10(1 + q.gain), 0, 3) + s.streak * 5 : 5;
    this.xp(xp);
    this.led('pitch', `${ASSETS[a.cls].name} to ${BUYERS[q.lead.seg].name}${got ? ' for ' + got : ''}`, q.received - q.fmv, { z, cm: q.ci.cm, S: q.ci.S, vN: q.ci.vN, vT: q.ci.vT, cls: a.cls, seg: q.lead.seg, fmv: q.fmv, recv: q.received });
    const outcome = q.ci.band.id === 'pioneer' ? 'pioneer' : q.ci.band.id === 'herd' ? 'herd' : win ? 'win' : 'flat';
    return ok(win ? 'Successful arbitrage.' : 'Traded, no gain.', { ...q, outcome, xp: Math.round(xp), gotName: got });
  }
  buyLot(zone, lotId) {
    const s = this.s, lot = s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot) return fail('That lot is gone.');
    if (s.cash < lot.price) return fail(`Need ${money(lot.price)}; you have ${money(s.cash)}.`);
    const held = s.assets.filter((a) => a.zone === zone).length + s.freight.reduce((n, f) => n + (f.to === zone ? f.items.length : 0), 0) + s.escrow.reduce((n, e) => n + e.assets.filter((a) => a.zone === zone).length, 0);
    if (held >= ZONES[zone].store) return fail('Storage is full here (crates in transit and in escrow count). Sell something or ship it out.');
    s.cash -= lot.price;
    s.lots[zone] = s.lots[zone].filter((l) => l.id !== lotId);
    const a = this._mk(s, lot.cls, { cond: lot.cond, zone, basis: lot.price, from: 'lot' });
    s.assets.push(a);
    this.led('buy', `Bought ${ASSETS[lot.cls].name}${lot.cond === 'broken' ? ' (broken)' : ''}`, -lot.price, { z: zone });
    return ok('Purchased.', { asset: a });
  }
  repairQuote(assetId) {
    const a = this.s.assets.find((x) => x.id === assetId);
    if (!a) return fail('No such asset.');
    const def = ASSETS[a.cls];
    if (a.cond !== 'broken' || !def.repair) return fail('Nothing to repair.');
    const ops = this.lvl('ops');
    const cost = repairCostFor(def.repair, ops, a.zone >= 2 ? this.mods().repair : 1);
    const q = restoreQuality(ops);
    const after = assetFMV({ ...a, cond: 'ok', quality: q }, a.zone, this.mods(), this.crowd(a.cls, a.zone));
    return ok('', { cost, quality: q, before: this.val(a), after, asset: a });
  }
  repairQuoteFor(cls, zone) {
    const def = ASSETS[cls], ops = this.lvl('ops');
    const cost = def.repair ? repairCostFor(def.repair, ops, zone >= 2 ? this.mods().repair : 1) : 0, quality = restoreQuality(ops);
    const after = assetFMV({ cls, cond: 'ok', quality, wear: 1 }, zone, this.mods(), this.crowd(cls, zone));
    return { cost, quality, after };
  }
  repair(assetId) {
    const q = this.repairQuote(assetId);
    if (!q.ok) return q;
    if (this.s.cash < q.cost) return fail(`Repair costs ${money(q.cost)}.`);
    this.s.cash -= q.cost;
    q.asset.cond = 'ok'; q.asset.quality = q.quality; q.asset.basis += q.cost;
    this.xp(20);
    this.led('repair', `Repaired ${ASSETS[q.asset.cls].name} to ${Math.round(q.quality * 100)}% quality`, -q.cost, { z: q.asset.zone });
    return ok('Repaired.', q);
  }
  poolQuote(ids, route = false) {
    const s = this.s, items = ids.map((id) => s.assets.find((a) => a.id === id)).filter(Boolean);
    if (!items.length) return fail('Select assets to sell.');
    const zone = route ? 3 : items[0].zone;
    if (!route && items.some((a) => a.zone !== zone)) return fail('Sell assets from one zone at a time.');
    if (route && (!s.zones.includes(3) || items.some((a) => !ASSETS[a.cls].tags.includes('digital')))) return fail('Digital routing needs Zone 3 access and digital assets.');
    const fric = route ? FEES.digitalRouting : ZONES[zone].friction + this.instFee('pool');
    const per = items.map((a) => ({ a, value: this.val(a, zone) * (1 - fric) }));
    const total = per.reduce((x, y) => x + y.value, 0);
    return ok('', { per, total, zone, delay: route ? 48 : this.liqDelay(zone), room: s.pool[zone], fric, route });
  }
  sellPool(ids, route = false) {
    const q = this.poolQuote(ids, route);
    if (!q.ok) return q;
    const s = this.s;
    if (q.total > s.pool[q.zone]) return fail(`The ${ZONES[q.zone].short} liquidity pool only has ${money(s.pool[q.zone])} left. It refills 35% a day.`, q);
    s.pool[q.zone] -= q.total;
    s.assets = s.assets.filter((a) => !ids.includes(a.id));
    for (const { a, value } of q.per) { this.logNiche(q.zone, a.cls, 'npc-pool', CM.ref); }
    if (q.delay) s.settle.push({ amt: q.total, at: s.hour + q.delay, note: 'Liquidation settlement' });
    else s.cash += q.total;
    s.pivot++;
    this.led('pool', `Sold ${q.per.length} asset(s) to the ${ZONES[q.zone].short} liquidity pool${q.delay ? ' (settles in ' + q.delay + 'h)' : ''}`, q.total, { z: q.zone });
    return ok(q.delay ? `Proceeds of ${money(q.total)} settle in ${q.delay} virtual hours.` : `Sold for ${money(q.total)}.`, q);
  }
  _settlements() {
    const s = this.s;
    if (!s.settle.length) return;
    const due = s.settle.filter((x) => x.at <= s.hour);
    if (!due.length) return;
    for (const d of due) { s.cash += d.amt; this.note('info', `${money(d.amt)} settled into cash.`); }
    s.settle = s.settle.filter((x) => x.at > s.hour);
  }
  freightQuote(ids, to) {
    const s = this.s, items = ids.map((id) => s.assets.find((a) => a.id === id)).filter(Boolean);
    if (!items.length) return fail('Select assets to ship.');
    if (!s.zones.includes(to)) return fail('You do not have access to that zone yet.');
    const from = items[0].zone;
    if (items.some((a) => a.zone !== from) || from === to) return fail('Pick assets from one zone and a different destination.');
    const book = items.reduce((x, a) => x + this.val(a), 0);
    const hasLog = s.pipes.some((p) => p.kind === 'logistics');
    const cost = book * FRESH.freightCost * (s.upg.freight ? 0.6 : 1) * (hasLog ? 0.8 : 1);
    const risk = clamp(FRESH.damageBase - 0.05 * this.lvl('ops'), 0.03, 0.3) * (hasLog ? 0.5 : 1);
    const room = ZONES[to].store - s.assets.filter((a) => a.zone === to).length - s.freight.filter((f) => f.to === to).reduce((x, f) => x + f.items.length, 0);
    return ok('', { items, from, to, book, cost, risk, hours: FRESH.freightHours, room });
  }
  ship(ids, to) {
    const q = this.freightQuote(ids, to);
    if (!q.ok) return q;
    const s = this.s;
    if (q.items.length > q.room) return fail('The destination does not have room for all of that.');
    if (s.cash < q.cost) return fail(`Freight costs ${money(q.cost)}.`);
    s.cash -= q.cost;
    s.assets = s.assets.filter((a) => !ids.includes(a.id));
    s.freight.push({ id: 'F' + s.nid++, items: q.items, to, arrive: s.hour + q.hours, risk: q.risk });
    this.led('freight', `Shipped ${q.items.length} asset(s) to ${ZONES[to].short}`, -q.cost, { z: to });
    return ok(`In transit for ${q.hours} virtual hours.`, q);
  }
  _freight() {
    const s = this.s;
    if (!s.freight.length) return;
    for (const f of s.freight.filter((x) => x.arrive <= s.hour)) {
      for (const a of f.items) {
        a.zone = f.to;
        if (this.rand() < f.risk) { a.quality *= 0.8; this.note('bad', `${ASSETS[a.cls].name} was damaged in transit (-20% quality). Higher Ops and a Logistics Agent cut this risk.`); }
        s.assets.push(a);
      }
      this.note('info', `Freight arrived in ${ZONES[f.to].short}.`);
    }
    s.freight = s.freight.filter((x) => x.arrive > s.hour);
  }
  train(skill) {
    const s = this.s, l = s.skills[skill];
    if (l >= SKILL_MAX) return fail('Already at mastery.');
    const c = trainCost(l);
    if (s.cash < c) return fail(`Training costs ${money(c)}.`);
    s.cash -= c; s.skills[skill]++;
    this.xp(60);
    this.led('train', `Trained ${SKILLS[skill].short} to level ${l + 1}`, -c);
    return ok(`${SKILLS[skill].short} is now level ${l + 1}.`);
  }

  // ------------------------------------------------------------------ automation
  autoLocked() {
    const s = this.s;
    return s.mil.m2 && (!s.auditFirst || !!s.auditPending);
  }
  pipeCost(kind, zone) {
    const n = this.s.pipes.filter((p) => p.zone === zone).length;
    return PIPE[kind].hire * PIPE_RULES.zoneScale[zone] * Math.pow(PIPE_RULES.hireGrowth, n);
  }
  pipeCap(p) { return PIPE[p.kind].cap * PIPE_RULES.zoneScale[p.zone] * Math.pow(2, p.level - 1); }
  pipeUpCost(p) { return PIPE[p.kind].hire * PIPE_RULES.zoneScale[p.zone] * Math.pow(PIPE_RULES.levelGrowth, p.level) * 1.5; }
  cycleLen(p) {
    const s = this.s, K = PIPE[p.kind], def = ASSETS[p.cls || 'pen'], m = this.mods();
    let len = PIPE_RULES.cycleBase / ZONES[p.zone].speed * K.cycle / (1 + 0.15 * (this.lvl('growth') - 1));
    if (s.upg.jit) len *= 0.8;
    len /= p.cls ? speedMult(def, p.zone, m) : 1;
    if (p.channel === 'intl') len += m.intlSlow;
    if (p.zone === 2 && s.velPenalty < 1) len /= s.velPenalty;
    return Math.max(3, Math.round(len));
  }
  forecast(p) {
    const s = this.s, K = PIPE[p.kind], m = this.mods(), z = p.zone;
    const alloc = Math.min(p.alloc || 0, this.pipeCap(p));
    const ci = p.cls && p.buyer ? this.cmFor(z, p.cls, p.buyer) : { cm: CM.ref, S: 0, vN: 0, vT: 0, band: creativityBand(CM.ref) };
    const rel = ci.cm / CM.ref;
    const def = p.cls ? ASSETS[p.cls] : null;
    const lane = def ? Math.sqrt(demandMult(def, z, m)) * priceMult(def, z, m) : 1;
    const learn = p.kind === 'student' ? Math.min(0.03, (p.cycles || 0) / 10 * 0.005) : 0;
    const margin = (K.margin + learn) * PIPE_RULES.zoneMargin[z] * (p.channel === 'intl' ? 1.3 : 1) * (s.upg.seo ? 1.08 : 1);
    const gross = alloc * margin * rel * lane;
    const fee = (alloc + gross) * this.instFee('pipe');
    const tax = Math.max(0, gross) * this.zoneTax(z);
    const roy = Math.max(0, gross) * K.royalty;
    const ov = (this.P.overheadMult || 1) * m.overhead * Math.max(0.5, 1 - 0.04 * (this.lvl('ops') - 1)) * (s.upg.jit ? 0.9 : 1);
    const overhead = (K.overhead * PIPE_RULES.overheadScale[z] + 0.002 * alloc) * ov;
    const net = gross - fee - tax - roy - overhead;
    const len = this.cycleLen(p);
    return { alloc, ci, rel, margin, gross, fee, tax, roy, overhead, net, len, perDay: net * 24 / len, cap: this.pipeCap(p) };
  }
  validLane(zone, cls, buyer) {
    if (!cls || !buyer) return fail('Choose an asset class and a buyer segment.');
    if (!ASSETS[cls] || ASSETS[cls].dem[zone - 1] <= 0) return fail('That asset has no market in this zone.');
    if (!BUYERS[buyer] || BUYERS[buyer].zone !== zone) return fail('That buyer is not in this zone.');
    if (fitOf(cls, buyer) < 0.3) return fail('That buyer has almost no use for that asset.');
    return ok();
  }
  hirePipeline(kind, zone, cfg = {}) {
    const s = this.s;
    if (!PIPE[kind]) return fail('Unknown manager.');
    if (!ZONES[zone].auto) return fail('No automated managers can work in the Scrap Yard. Everything there is manual.');
    if (!s.zones.includes(zone)) return fail('You do not have access to that zone.');
    if (this.autoLocked()) return fail('Gate 2: automation expansion is locked until you resolve your Regulatory Audit.');
    if (s.pipes.filter((p) => p.zone === zone).length >= PIPE_RULES.max[zone]) return fail('All management slots in this zone are filled.');
    const lane = this.validLane(zone, cfg.cls, cfg.buyer);
    if (!lane.ok) return lane;
    const cost = this.pipeCost(kind, zone);
    if (s.cash < cost) return fail(`Hiring costs ${money(cost)}.`);
    s.cash -= cost;
    const p = { id: 'P' + s.nid++, kind, zone, level: 1, cls: cfg.cls, buyer: cfg.buyer, channel: cfg.channel === 'intl' ? 'intl' : 'dom', alloc: 0, prog: 0, len: 0, inflight: 0, cycles: 0, profit: 0, basis: cost, status: 'idle', pausedUntil: 0, starved: false };
    p.alloc = Math.min(cfg.alloc ?? this.pipeCap(p), this.pipeCap(p));
    s.pipes.push(p);
    this.xp(120);
    this.led('hire', `Hired a ${PIPE[kind].name} in ${ZONES[zone].short}`, -cost, { z: zone });
    this.note('good', `${PIPE[kind].name} hired. Pipeline lane: ${ASSETS[cfg.cls].name} to ${BUYERS[cfg.buyer].name}.`);
    return ok('Hired.', { pipe: p });
  }
  configure(pid, cfg) {
    const p = this.s.pipes.find((x) => x.id === pid);
    if (!p) return fail('No such pipeline.');
    const cls = cfg.cls ?? p.cls, buyer = cfg.buyer ?? p.buyer;
    const lane = this.validLane(p.zone, cls, buyer);
    if (!lane.ok) return lane;
    if ((cls !== p.cls || buyer !== p.buyer || (cfg.channel && cfg.channel !== p.channel)) && p.inflight) return fail('Wait for the current cycle to finish before changing the lane.');
    if (cls !== p.cls || buyer !== p.buyer || (cfg.channel && cfg.channel !== p.channel)) this.s.pivot++;
    p.cls = cls; p.buyer = buyer;
    if (cfg.channel) p.channel = cfg.channel === 'intl' ? 'intl' : 'dom';
    if (cfg.alloc != null) p.alloc = clamp(+cfg.alloc || 0, 0, this.pipeCap(p));
    return ok('Updated.');
  }
  upgradePipeline(pid) {
    const s = this.s, p = s.pipes.find((x) => x.id === pid);
    if (!p) return fail('No such pipeline.');
    if (this.autoLocked()) return fail('Gate 2: automation expansion is locked until you resolve your Regulatory Audit.');
    if (p.level >= PIPE_RULES.maxLevel) return fail('Maximum level.');
    const c = this.pipeUpCost(p);
    if (s.cash < c) return fail(`Upgrading costs ${money(c)}.`);
    s.cash -= c; p.level++; p.basis += c; this.xp(80);
    this.led('hire', `Upgraded ${PIPE[p.kind].name} to level ${p.level}`, -c, { z: p.zone });
    return ok('Upgraded.');
  }
  pausePipeline(pid, paused) {
    const p = this.s.pipes.find((x) => x.id === pid);
    if (!p) return fail('No such pipeline.');
    p.status = paused ? 'paused' : 'idle';
    this.s.pivot++;
    return ok(paused ? 'Paused.' : 'Resumed.');
  }
  releasePipeline(pid) {
    const s = this.s, p = s.pipes.find((x) => x.id === pid);
    if (!p) return fail('No such pipeline.');
    if (p.inflight) return fail('Wait for the running cycle to finish.');
    s.pipes = s.pipes.filter((x) => x.id !== pid);
    const v = p.basis * 0.6;
    s.cash += v; s.pivot++;
    this.led('hire', `Released ${PIPE[p.kind].name}`, v, { z: p.zone });
    return ok(`Recovered ${money(v)} (60% of what you put in).`);
  }
  buyUpgrade(id) {
    const s = this.s, U = UPGRADES[id];
    if (!U || s.upg[id]) return fail('Already installed.');
    if (!s.zones.includes(U.zone)) return fail('Unlocks with Zone 2.');
    if (s.cash < U.cost) return fail(`Costs ${money(U.cost)}.`);
    s.cash -= U.cost; s.upg[id] = true; this.xp(100);
    this.led('upgrade', `Installed ${U.name}`, -U.cost);
    return ok('Installed.');
  }
  _pipelines() {
    const s = this.s;
    for (const p of s.pipes) {
      if (s.insolvent || s.exiting) continue;
      if (p.status === 'paused') continue;
      if (p.pausedUntil > s.hour) { p.status = 'audit'; continue; }
      if (p.inflight) {
        p.prog++;
        if (p.prog >= p.len) this._cycleDone(p);
      }
      p.starved = false;
      if (!p.inflight && p.cls) {
        const alloc = Math.min(p.alloc, this.pipeCap(p));
        if (alloc > 0 && s.cash >= alloc) { s.cash -= alloc; p.inflight = alloc; p.prog = 0; p.len = this.cycleLen(p); }
        else p.starved = alloc > 0;
      }
      p.status = p.inflight ? 'running' : 'idle';
    }
  }
  _cycleDone(p) {
    const s = this.s, f = this.forecast({ ...p, alloc: p.inflight });
    s.cash += p.inflight + f.net;
    p.inflight = 0; p.cycles++; p.profit += f.net; p.prog = 0;
    s.acc.profit += f.net; s.lastAuto = s.hour;
    this.logNiche(p.zone, p.cls, p.buyer, f.ci.cm);
    this.led('pipe', `${PIPE[p.kind].name}: ${ASSETS[p.cls].name} to ${BUYERS[p.buyer].name}`, f.net, { z: p.zone, cm: f.ci.cm, pid: p.id });
    this.xp(Math.max(1, Math.log10(Math.abs(f.net) + 1) * 4));
  }

  // ------------------------------------------------------------------ clients (CAC vs LTV)
  clientQuote(tier) {
    const s = this.s, C = CLIENTS[tier];
    const cac = C.cac * (this.P.cacMult || 1) * Math.max(0.5, 1 - 0.08 * (this.lvl('growth') - 1)) * (s.upg.seo ? 0.85 : 1);
    const days = C.days, ltv = C.perDay * days * (1 - this.zoneTax(C.zone));
    return { cac, ltv, ratio: ltv / cac, payback: cac / (C.perDay * (1 - this.zoneTax(C.zone))), perDay: C.perDay, days };
  }
  acquireClient(tier) {
    const s = this.s, C = CLIENTS[tier];
    if (!s.zones.includes(C.zone)) return fail('Not available in your zones yet.');
    if (C.needs && !s.mil[C.needs]) return fail(`Unlocks at Milestone ${C.needs.slice(1)}.`);
    if (C.b2b && this.P.b2bLockNW && this.netWorth() < this.P.b2bLockNW) return fail(`Heavy B2B pools stay closed to the Mid-Tier profile until net worth reaches ${money(this.P.b2bLockNW)}.`);
    if (s.clients.filter((c) => c.tier === tier).length >= C.max) return fail('You already hold the maximum of these accounts.');
    if (s.pipes.length < C.minRunning) return fail(`This account's SLA needs ${C.minRunning} pipeline${C.minRunning > 1 ? 's' : ''} running. Build the capacity first, then sign the client.`);
    const q = this.clientQuote(tier);
    if (s.cash < q.cac) return fail(`Acquisition costs ${money(q.cac)}.`);
    s.cash -= q.cac;
    s.clients.push({ id: 'C' + s.nid++, tier, cac: q.cac, until: s.hour + C.days * 24, earned: 0, breaches: 0 });
    this.xp(90);
    this.led('client', `Signed a ${C.name}`, -q.cac);
    return ok('Account signed.', q);
  }
  runningPipes() { return this.s.pipes.filter((p) => p.status === 'running').length; }

  // ------------------------------------------------------------------ bank
  loanRoom(prod) {
    const s = this.s, L = LOANS[prod], mult = this.P.creditMult || 1;
    const owed = s.loans.filter((l) => l.prod === prod).reduce((a, l) => a + l.principal + l.accr, 0);
    let lim;
    if (prod === 'pipeline') lim = L.limitPct * (this.invValue() + s.pipes.reduce((a, p) => a + p.basis, 0));
    else lim = L.limit * mult;
    const de = Math.max(0, DEBT.maxDE * this.netWorth() - this.debt());
    return { limit: lim, owed, room: Math.max(0, Math.min(lim - owed, de)), de };
  }
  loanBlock(prod) {
    const s = this.s;
    if (!s.mil.m1) return 'The Commercial Bank opens at $1,000 net worth.';
    if (this.mods().freeze) return 'Credit Action Override: no new loans until the freeze lifts.';
    if (LOANS[prod].zone && !s.zones.includes(LOANS[prod].zone)) return 'Needs Zone 3 access.';
    if (s.insolvent) return 'Your account is insolvent.';
    return '';
  }
  draw(prod, amount) {
    const s = this.s, L = LOANS[prod];
    const block = this.loanBlock(prod);
    if (block) return fail(block);
    const r = this.loanRoom(prod);
    amount = Math.min(+amount || 0, r.room);
    if (amount <= 0) return fail('Nothing available to draw. Your debt-to-equity ratio caps borrowing at 3.0.');
    const fee = amount * L.fee;
    s.cash += amount - fee;
    s.loans.push({ id: 'D' + s.nid++, prod, principal: amount, accr: 0, last: s.hour, next: s.hour + L.every, drawn: s.hour });
    if (prod === 'enterprise') s.entOpened = true;
    this.led('loan', `Drew ${money(amount)} on the ${L.name}`, amount - fee, { fee });
    this.note('warn', `Liability added: ${money(amount)} at ${(this.loanRate(prod) * 100).toFixed(1)}% per 30 days.`);
    return ok(`Drew ${money(amount)} (fee ${money(fee)}).`);
  }
  repay(loanId, amount) {
    const s = this.s, l = s.loans.find((x) => x.id === loanId);
    if (!l) return fail('No such loan.');
    const owed = l.principal + l.accr;
    amount = Math.min(+amount || owed, owed, s.cash);
    if (amount <= 0) return fail('No cash to repay with.');
    s.cash -= amount;
    const toAccr = Math.min(l.accr, amount);
    l.accr -= toAccr; l.principal -= amount - toAccr;
    if (l.principal + l.accr < 0.005) s.loans = s.loans.filter((x) => x.id !== loanId);
    s.pivot++;
    this.led('repay', `Repaid ${money(amount)}`, -amount);
    return ok(`Repaid ${money(amount)}.`);
  }
  _marginCall() {
    const s = this.s;
    if (!s.loans.length || this.deRatio() <= DEBT.callDE || !(s.pipes.length || s.assets.length)) return;
    this.note('bad', 'MARGIN CALL: debt-to-equity passed 4.5. The bank is liquidating assets at a 35% fire-sale discount.', { alert: { code: 'BANK-MARGIN-LIQ', name: 'Margin Liquidation Protocol', level: 3, readout: 'Debt-to-equity exceeded 4.5. The bank is seizing your highest-value pipelines until the ratio is back to 3.0.', vars: [], enforcement: 'Automatic and immediate.' } });
    let guard = 0;
    while (this.deRatio() > DEBT.maxDE && guard++ < 40) {
      let proceeds = 0, what = '';
      const top = [...s.pipes].sort((a, b) => b.basis - a.basis)[0];
      if (top) {
        proceeds = top.basis * (1 - DEBT.fireSale) + (top.inflight || 0);
        s.pipes = s.pipes.filter((p) => p !== top);
        what = PIPE[top.kind].name;
      } else {
        const a = [...s.assets].sort((x, y) => this.val(y) - this.val(x))[0];
        if (!a) break;
        proceeds = this.val(a) * (1 - DEBT.fireSale);
        s.assets = s.assets.filter((x) => x !== a);
        what = ASSETS[a.cls].name;
      }
      this.led('margin', `Margin call seized ${what}`, proceeds);
      s.cash += proceeds;
      const loans = [...s.loans].sort((a, b) => this.loanRate(b.prod) - this.loanRate(a.prod));
      for (const l of loans) { if (s.cash <= 0) break; this.repay(l.id, Math.min(s.cash, l.principal + l.accr)); }
    }
  }

  // ------------------------------------------------------------------ daily tick, audits
  _dayTick() {
    const s = this.s, day = this.day;
    for (const a of s.assets) a.wear *= 1 - ASSETS[a.cls].dep * 0.002 * (s.upg.jit ? 0.5 : 1);
    let dayProfit = s.acc.profit;
    // clients
    for (const c of s.clients) {
      const C = CLIENTS[c.tier];
      if (s.hour >= c.until) { c.done = true; continue; }
      if (this.runningPipes() >= C.minRunning || C.minRunning === 0) {
        const rev = C.perDay * (1 - this.zoneTax(C.zone));
        s.cash += rev; c.earned += rev; dayProfit += rev;
      } else {
        const pen = C.perDay * 2;
        s.cash -= pen; c.breaches++; dayProfit -= pen;
        this.note('bad', `SLA breach on a ${C.name}: ${money(pen)} penalty. Keep ${C.minRunning} pipeline(s) running.`);
        if (c.breaches >= 2) { c.done = true; this.note('bad', `The ${C.name} walked away after repeated SLA breaches.`); }
      }
    }
    for (const c of s.clients.filter((c) => c.done)) this.led('client', `${CLIENTS[c.tier].name} contract ended: earned ${money(c.earned)} on ${money(c.cac)} CAC`, c.earned - c.cac);
    s.clients = s.clients.filter((c) => !c.done);
    // loans accrue daily, compound on schedule
    for (const l of s.loans) {
      const r = this.loanRate(l.prod);
      l.accr += l.principal * r / 30;
      dayProfit -= l.principal * r / 30;
      if (s.hour >= l.next) {
        l.principal += l.accr; l.accr = 0; l.next = s.hour + LOANS[l.prod].every;
        if (l.prod === 'enterprise' && s.entOpened) {
          const unused = Math.max(0, LOANS.enterprise.limit * (this.P.creditMult || 1) - l.principal);
          const fee = unused * LOANS.enterprise.commit;
          if (fee > 0) { l.principal += fee; this.led('loan', 'Unused-commitment fee', -fee); }
        }
      }
    }
    if (s.cash < 0) { const od = -s.cash * 0.005; s.cash -= od; s.overdraft += od; if (day % 3 === 0) this.note('bad', `Cash is negative (${money(s.cash)}). Overdraft interest is accruing.`); }
    // p2p royalty streams you pay
    for (const r of s.royalties) {
      if (r.dir === 'pay' && s.hour <= r.until) { const amt = Math.min(r.perDay, Math.max(0, s.cash)); s.cash -= amt; this.out.push({ t: 'royalty', to: r.peer, amount: amt, offer: r.offer }); }
    }
    s.royalties = s.royalties.filter((r) => s.hour <= r.until);
    s.dp.push(dayProfit); if (s.dp.length > 14) s.dp.shift();
    (s.hist ||= []).push([s.hour, Math.max(0.01, this.netWorth())]);
    s.acc.profit = 0;
    const from = s.hour - 120;
    s.niche = s.niche.filter((n) => n[0] > from);
    this._algoEvent(day + 1);
    this._checkpoint();
  }
  receiveRoyalty(amount, offer) { this.s.cash += amount; this.led('p2p', 'Royalty received', amount, { offer }); }
  _audits() {
    const s = this.s;
    if (!s.mil.m2) return;
    if (!s.auditPending && s.auditNext != null && s.hour >= s.auditNext) {
      const t = AUDIT_THEMES[Math.floor(this.rand() * AUDIT_THEMES.length)];
      s.auditPending = { ...t, id: 'AU' + s.nid++, due: s.hour + AUDIT.deadlineHours, at: s.hour };
      s.auditNext = null;
      this.note('warn', `Audit event: ${t.title}. You have 72 virtual hours to respond.`, { audit: true });
    }
    const a = s.auditPending;
    if (a && s.hour >= a.due) {
      s.auditIgnored++;
      this._auditFail(true);
      s.auditPending = null; s.auditFirst = true;
      s.auditNext = s.hour + AUDIT.everyDays * 24 / this.env.difficulty.audit;
    }
  }
  auditFine() { return AUDIT.fine * Math.pow(1.5, this.s.auditFail); }
  _auditFail(ignored) {
    const s = this.s, fine = this.auditFine();
    s.cash -= fine; s.auditFail++; s.velPenalty *= AUDIT.velocityHit;
    this.led('audit', ignored ? 'Ignored audit: automatic penalty' : 'Failed audit: fine and velocity penalty', -fine);
    this.note('bad', `${ignored ? 'You ignored the audit. ' : 'You were caught. '}Fine ${money(fine)} and a permanent -15% on Zone 2 pipeline velocity. Repeat failures compound.`);
  }
  resolveAudit(choice, pipeId) {
    const s = this.s, a = s.auditPending;
    if (!a) return fail('No audit is pending.');
    let msg = '';
    if (choice === 'A') {
      const fee = AUDIT.fee * Math.max(0.7, 1 - 0.03 * (this.lvl('fintech') - 1));
      if (s.cash < fee) return fail(`The consultant costs ${money(fee)}.`);
      s.cash -= fee; s.auditPass++;
      this.led('audit', 'Filed with a compliance consultant', -fee);
      msg = `Filed. ${money(fee)} paid, pipelines untouched.`;
    } else if (choice === 'B') {
      const p = s.pipes.find((x) => x.id === pipeId) || s.pipes[0];
      if (!p) return fail('You need a pipeline manager to dedicate. Choose another path.');
      p.pausedUntil = s.hour + AUDIT.pauseHours; s.auditPass++;
      this.led('audit', `Dedicated ${PIPE[p.kind].name} to compliance for 5 days`, 0);
      msg = `${PIPE[p.kind].name} will do compliance for 5 virtual days.`;
    } else if (choice === 'C') {
      if (this.rand() < AUDIT.passChance) { s.auditPass++; this.led('audit', 'Bypassed filing and got away with it', 0); msg = 'You slipped through. This time.'; }
      else { this._auditFail(false); msg = 'Caught. Fine and velocity penalty applied.'; }
    } else return fail('Pick A, B or C.');
    s.auditPending = null; s.auditFirst = true;
    s.auditNext = s.hour + AUDIT.everyDays * 24 / this.env.difficulty.audit;
    this.xp(70);
    return ok(msg);
  }

  // ------------------------------------------------------------------ exit (M&A / IPO)
  exitQuote(kind) {
    const s = this.s;
    if (!s.mil.m3) return fail('Exit options unlock at $250,000 net worth.');
    if (kind === 'ipo' && s.auditFail > 0) return fail('IPO preparation needs a clean compliance record. Choose a trade sale.');
    const avg = s.dp.length ? s.dp.reduce((a, b) => a + b, 0) / s.dp.length : 0;
    const mult = kind === 'ipo' ? 10 : 6;
    const premium = Math.max(0, avg) * mult * Math.max(0.3, 1 - 0.15 * s.auditFail);
    const hard = this.invValue() + s.pipes.reduce((a, p) => a + p.basis + (p.inflight || 0), 0) + s.freight.reduce((a, f) => a + f.items.reduce((x, i) => x + this.val(i, f.to), 0), 0);
    const brokerage = (hard + premium) * FEES.exitBrokerage;
    const proceeds = s.cash + hard + premium - brokerage - this.debt() + s.settle.reduce((a, x) => a + x.amt, 0);
    return ok('', { avg, premium, hard, brokerage, proceeds, hours: 48, daysLeft: this.daysRemaining() - 2, eeiIfNow: eeiCalc(proceeds, s.startCapital, Math.max(0, this.daysRemaining() - 2), this.env.difficulty.eeiFloor) });
  }
  exit(kind) {
    const q = this.exitQuote(kind);
    if (!q.ok) return q;
    const s = this.s;
    if (s.exiting) return fail('An exit is already settling.');
    s.exiting = { kind, at: s.hour + 48, proceeds: q.proceeds };
    s.assets = []; s.pipes = []; s.freight = []; s.clients = []; s.loans = []; s.settle = []; s.cash = 0;
    s.settle.push({ amt: q.proceeds, at: s.hour + 48, note: 'Exit' });
    this.led('exit', `Began a ${kind === 'ipo' ? 'IPO' : 'trade sale'}`, q.proceeds);
    this.note('good', `${kind === 'ipo' ? 'IPO' : 'Trade sale'} launched. Governance drag: it settles in 48 virtual hours.`);
    return ok('Exit under way.', q);
  }
  _finishExit() {
    const s = this.s;
    s.cash += s.settle.reduce((a, x) => a + x.amt, 0); s.settle = [];
    const nw = s.cash;
    s.exit = { kind: s.exiting.kind, hour: s.hour, nw, daysLeft: this.daysRemaining(), eei: eeiCalc(nw, s.startCapital, this.daysRemaining(), this.env.difficulty.eeiFloor) };
    s.exiting = null; s.over = true;
    this.led('exit', 'Exit completed', nw);
    this.note('good', `Exit complete at ${money(nw)}. Score locked with ${Math.round(this.daysRemaining())} days to spare.`, { final: true });
  }

  // ------------------------------------------------------------------ peer-to-peer exchange
  pub(a) { return { id: a.id, cls: a.cls, cond: a.cond, quality: a.quality, wear: a.wear, zone: a.zone, fmv: this.val(a), basis: a.basis }; }
  sideValue(side) {
    const roy = side.royalty ? side.royalty.perDay * side.royalty.days : 0;
    return (side.assets || []).reduce((x, a) => x + assetFMV(a, a.zone, this.mods(), this.crowd(a.cls, a.zone)), 0) + (side.cash || 0) + roy;
  }
  checkOffer(offer) {
    const va = this.sideValue(offer.give), vb = this.sideValue(offer.want);
    const variance = fmvVariance(va, vb);
    return { va, vb, variance, ok: variance <= FMV_BAND, flagged: variance > FMV_BAND };
  }
  /** What an asset would be worth in YOUR hands: Ops restores broken goods, Growth monetises digital ones. */
  projected(pubAsset, skills = this.s.skills, mods = this.mods()) {
    const def = ASSETS[pubAsset.cls], z = pubAsset.zone;
    const working = assetFMV({ ...pubAsset, cond: 'ok', quality: 1, wear: pubAsset.wear ?? 1 }, z, mods, 1);
    if (pubAsset.cond === 'broken' && def.repair) {
      const q = restoreQuality(skills.ops), cost = repairCostFor(def.repair, skills.ops, z >= 2 ? mods.repair : 1);
      return working * q - cost;
    }
    if (def.tags.includes('digital')) return working * Math.min(1.4, 0.7 + 0.1 * skills.growth);
    return assetFMV(pubAsset, z, mods, 1);
  }
  createOffer({ to, giveIds = [], giveCash = 0, want = { assets: [], cash: 0 }, royalty = null, note = '' }) {
    const s = this.s;
    const assets = giveIds.map((id) => s.assets.find((a) => a.id === id));
    if (assets.some((a) => !a)) return fail('You no longer own one of those assets.');
    giveCash = Math.max(0, +giveCash || 0);
    if (!assets.length && !giveCash && !royalty) return fail('Offer something.');
    const offer = {
      id: 'O' + s.pid + '-' + s.nid++, from: s.pid, fromHandle: s.handle, to, at: s.hour, note,
      give: { assets: assets.map((a) => ({ ...a })), cash: giveCash, royalty: royalty && royalty.perDay > 0 ? { perDay: +royalty.perDay, days: Math.max(1, Math.round(royalty.days)) } : null },
      want: { assets: want.assets || [], cash: Math.max(0, +want.cash || 0) },
      skills: { ...s.skills },
    };
    const chk = this.checkOffer(offer);
    offer.check = chk;
    if (!chk.ok) {
      this.out.push({ t: 'flag', offer: { id: offer.id, from: s.pid, to, variance: chk.variance, va: chk.va, vb: chk.vb } });
      return fail(`Extreme Asymmetric Premium Warning: this deal deviates ${(chk.variance * 100).toFixed(0)}% from fair market value (limit ${FMV_BAND * 100}%). It was blocked and flagged for your instructor.`, { offer, chk });
    }
    if (giveCash > s.cash) return fail('You do not have that much cash.');
    s.assets = s.assets.filter((a) => !giveIds.includes(a.id));
    s.cash -= giveCash;
    s.escrow.push({ offerId: offer.id, assets, cash: giveCash, at: s.hour, offer });
    this.led('p2p', `Proposed a swap to ${to}`, 0, { offer: offer.id });
    return ok('Offer sent. Your side is held in escrow until they answer.', { offer });
  }
  acceptOffer(offer) {
    const s = this.s;
    const chk = this.checkOffer(offer);
    if (!chk.ok) return fail(`Blocked: ${(chk.variance * 100).toFixed(0)}% off fair market value.`, { chk });
    const mine = offer.want.assets.map((w) => s.assets.find((a) => a.id === w.id));
    if (mine.some((a) => !a)) return fail('You no longer hold the asset they asked for.');
    if (offer.want.cash > s.cash) return fail('You do not have the cash they asked for.');
    s.assets = s.assets.filter((a) => !mine.includes(a));
    s.cash -= offer.want.cash;
    const gave = mine.map((a) => ({ ...a }));
    for (const a of offer.give.assets) s.assets.push(this._home({ ...a, id: 'A' + s.nid++, from: 'p2p', basis: assetFMV(a, a.zone, this.mods(), 1) }));
    s.cash += offer.give.cash;
    if (offer.give.royalty) s.royalties.push({ dir: 'recv', peer: offer.from, perDay: offer.give.royalty.perDay, until: s.hour + offer.give.royalty.days * 24, offer: offer.id });
    s.p2p++; s.trades++; s.pivot++;
    this.xp(120);
    const net = this.sideValue(offer.give) - this.sideValue(offer.want);
    this.led('p2p', `Swapped with ${offer.fromHandle || offer.from}`, net, { offer: offer.id, peer: offer.from, peerSkills: offer.skills, gave: gave.map((a) => a.cls), got: offer.give.assets.map((a) => a.cls), va: chk.va, vb: chk.vb, variance: chk.variance });
    return ok('Deal done.', { deliver: { assets: gave, cash: offer.want.cash }, chk });
  }
  /** A swapped-in asset must sit in a zone this founder can enter; otherwise it is delivered to the nearest open one. */
  _home(a) {
    const s = this.s;
    if (!s.zones.includes(a.zone)) { const open = [...s.zones].sort((x, y) => y - x); a.zone = open.find((z) => z <= a.zone) ?? open[open.length - 1]; this.note('info', `${ASSETS[a.cls].name} was delivered to ${ZONES[a.zone].short}, the nearest zone you can enter.`); }
    return a;
  }
  finalizeOffer(offerId, delivery, peerHandle = '') {
    const s = this.s, e = s.escrow.find((x) => x.offerId === offerId);
    if (!e) return fail('That offer is no longer open.');
    s.escrow = s.escrow.filter((x) => x !== e);
    for (const a of delivery.assets || []) s.assets.push(this._home({ ...a, id: 'A' + s.nid++, from: 'p2p', basis: assetFMV(a, a.zone, this.mods(), 1) }));
    s.cash += delivery.cash || 0;
    const o = e.offer;
    if (o.give.royalty) s.royalties.push({ dir: 'pay', peer: o.to, perDay: o.give.royalty.perDay, until: s.hour + o.give.royalty.days * 24, offer: o.id });
    s.p2p++; s.trades++; s.pivot++;
    this.xp(120);
    this.led('p2p', `Swap completed with ${peerHandle || o.to}`, this.sideValue(delivery ? { assets: delivery.assets, cash: delivery.cash } : {}) - this.sideValue(o.give), { offer: o.id, peer: o.to, gave: e.assets.map((a) => a.cls), got: (delivery.assets || []).map((a) => a.cls), ...(o.check ? { va: o.check.va, vb: o.check.vb, variance: o.check.variance } : {}) });
    return ok('Swap completed.');
  }
  cancelOffer(offerId, reason = 'Offer withdrawn.') {
    const s = this.s, e = s.escrow.find((x) => x.offerId === offerId);
    if (!e) return fail('Not found.');
    s.escrow = s.escrow.filter((x) => x !== e);
    for (const a of e.assets) s.assets.push(a);
    s.cash += e.cash;
    return ok(reason);
  }
  _escrowExpiry() {
    const s = this.s;
    for (const e of [...s.escrow]) if (s.hour - e.at > 72) { this.cancelOffer(e.offerId); this.out.push({ t: 'withdraw', offer: e.offerId, to: e.offer.to }); this.note('info', 'An unanswered offer expired and your escrow was returned.'); }
  }

  // ------------------------------------------------------------------ persistence, snapshots
  _checkpoint() {
    const day = Math.floor(this.s.hour / 24);
    this.ckpt.set(day, JSON.stringify(this.s));
    for (const k of this.ckpt.keys()) if (k < day - 10) this.ckpt.delete(k);
  }
  rewindTo(hour) {
    let best = null;
    for (const [k, v] of this.ckpt) if (k * 24 <= hour && (best == null || k > best)) best = k;
    if (best == null) return null;
    this.s = JSON.parse(this.ckpt.get(best));
    this._m = null;
    for (const k of [...this.ckpt.keys()]) if (k > best) this.ckpt.delete(k);
    return this.s.hour;
  }
  toJSON() { return this.s; }
  niches48() {
    const out = {}, from = this.s.hour - 48;
    for (const [h, z, c, b] of this.s.niche) if (h > from && b !== 'npc-pool') { const k = nicheKey(z, c, b); out[k] = (out[k] || 0) + 1; }
    return out;
  }
  publicSnapshot() {
    const s = this.s, nw = this.netWorth();
    return {
      pid: s.pid, handle: s.handle, profile: s.profile, specialty: s.specialty, skills: { ...s.skills }, hour: s.hour,
      nw, cash: s.cash, debt: this.debt(), startCap: s.startCapital, eei: this.eei(), zones: Math.max(...s.zones),
      pipelines: s.pipes.length, lastAutoHour: s.lastAuto, autoEligible: s.mil.m1 && !s.over, niches: this.niches48(),
      cmAvg: s.cm.n ? s.cm.sum / s.cm.n : 0, p2p: s.p2p, trades: s.trades, flags: { insolvent: s.insolvent, exited: !!s.exit, over: s.over },
      shockLog: s.shockLog.map((x) => ({ id: x.id, nw: x.nw, nwAfter: x.nwAfter, pivots: x.pivots, de: x.de })),
      hoursPlayed: Math.round((s.hour - s.startHour) / 24 * 10) / 10, auditFail: s.auditFail,
      inventory: s.assets.slice(0, 24).map((a) => this.pub(a)), mil: s.mil,
    };
  }
}

export { obviousBuyer, utilityIn };
