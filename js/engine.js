// The simulation engine. Pure JS, no DOM. One step = one virtual hour; 24 hours = 1 virtual day; 90 days = a run.
// Every student-facing action is a method that returns {ok, msg, ...}. Everything the UI shows is read from `game.s`.
import {
  TOTAL_DAYS, TOTAL_HOURS, ECON, MIL, MIL_ZONE, CM, FEES, FMV_BAND, EEI_FLOOR_DEFAULT, BASE_RATE, DEBT, ZONES, ZONE_IDS, SKILLS, SKILL_MAX,
  PERKS, perkMods, ASSETS, BUYERS, PIPE, PIPE_RULES, pipeScale, pipeMargin, pipeOverhead, UPGRADES, CLIENTS, LOANS, AUDIT_THEMES, AUDIT, EVENTS, ALGO_EVENTS, WARN_LEAD, FRESH,
} from './config.js';
import {
  clamp, creativity, creativityBand, saturation, eei as eeiCalc, fmvVariance, restoreQuality, repairCostFor, fitOf, fitMult,
  nicheKey, assetFMV, demandMult, priceMult, speedMult, obviousBuyer, utilityIn, demandOf, truthMult, FAKE_VALUE,
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
    this.onEvent = null; // game events for quests, achievements and the Academy (docs/V2_DESIGN.md 7.1)
    this.evq = [];
    this._m = null;
    this.s = opts.state || this._new(opts);
  }

  // ------------------------------------------------------------------ construction
  _new({ perks = [], handle = 'Founder', pid = 'PC-' + Math.random().toString(36).slice(2, 6).toUpperCase(), seed, specialty = 'ops', startHour = 0 }) {
    perks = [...new Set(perks)].filter((id) => PERKS[id]).slice(0, 2);
    const P = perkMods(perks);
    seed = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
    const skills = { ops: 1, growth: 1, fintech: 1 };
    if (!P.noSpecialty && skills[specialty] != null) skills[specialty] = 3;
    // Everyone starts identical: one paperclip, no cash. The Backgrounds are the only difference (docs/V2_DESIGN.md section 2).
    const s = {
      v: 2, pid, handle, perks, specialty: P.noSpecialty ? null : specialty, seed, rng: seed, startHour, hour: startHour,
      cash: 0, startCapital: ASSETS.paperclip.base, skills, xp: 0, points: 0, lvlPaid: 1, rep: 50, streak: 0, bestStreak: 0, loyal: {},
      zones: [], mil: { m1: false, m2: false, m3: false }, nid: 1,
      assets: [], leads: {}, lots: {}, pool: {},
      pipes: [], upg: {}, clients: [], loans: [], settle: [], freight: [], escrow: [], royalties: [],
      events: [], alertsSeen: {}, auditPending: null, auditNext: null, auditFirst: false, auditFail: 0, auditPass: 0, auditIgnored: 0, velPenalty: 1,
      ledger: [], news: [], niche: [], shockLog: [], pivot: 0, acc: { profit: 0 }, dp: [], lastAuto: startHour, trades: 0, p2p: 0, cm: { sum: 0, n: 0 },
      insolvent: false, exiting: null, exit: null, over: false, peak: ASSETS.paperclip.base, entOpened: false, overdraft: 0, hist: [],
      ps: { bailout: P.bailout?.uses || 0, fineWaive: P.fineWaive || 0, garnished: 0, burnoutUntil: 0, goodwillUntil: 0 },
    };
    s.assets.push(this._mk(s, 'paperclip', { zone: 1, basis: ASSETS.paperclip.base }));
    for (const [id, def] of Object.entries(EVENTS)) {
      const start = (def.day - 1) * 24;
      if (start >= startHour) s.events.push(this._evInstance(id, start));
    }
    this.s = s;
    this._openZone(1);
    this._spawnLead(1, false, true);
    this._unlock();
    this._checkpoint();
    return s;
  }
  _openZone(z) {
    const s = this.s;
    if (!s.zones.includes(z)) s.zones.push(z);
    s.leads[z] ||= []; s.lots[z] ||= []; s.pool[z] ??= ZONES[z].pool;
    for (let i = 0; i < 4; i++) { this._spawnLead(z); this._spawnLot(z); }
  }
  _mk(s, cls, o = {}) {
    return { id: 'A' + s.nid++, cls, cond: o.cond || 'ok', quality: o.quality ?? 1, wear: 1, zone: o.zone ?? 1, basis: o.basis ?? 0, from: o.from || 'start', got: s.hour };
  }
  _evInstance(kind, start, extra = {}) {
    const d = EVENTS[kind];
    return { id: extra.id || `${kind}@${start}`, kind, name: d.name, start, phases: d.phases, level: d.level, alert: d.alert, short: d.short, warned: false, started: false, ...extra };
  }

  // ------------------------------------------------------------------ small helpers
  /** The aggregated mods of the player's two Backgrounds (js/data/perks.js). */
  get P() {
    const k = this.s.perks.join(',');
    if (this._pk !== k) { this._pk = k; this._P = perkMods(this.s.perks); }
    return this._P;
  }
  /** Permanent bonuses earned by unlocking districts (docs/V2_DESIGN.md 4.1). */
  get B() {
    const n = this.s.zones.length;
    if (this._bn !== n) {
      const B = { freightMult: 1, capMult: 1, leadMult: 1, spreadMult: 1, storeBonus: 0, lotSlots: 0, feeMult: 1, repairMult: 1, rentMult: 1, exitMult: 1, creditLimitMult: 1 };
      for (const z of this.s.zones) for (const [k, v] of Object.entries(ZONES[z].bonus || {})) { if (k === 'storeBonus' || k === 'lotSlots') B[k] += v; else B[k] *= v; }
      this._bn = n; this._B = B;
    }
    return this._B;
  }
  /** Telemetry for quests, achievements and the Academy. */
  emit(type, payload = {}) {
    const evt = { type, day: this.day, ...payload };
    this.evq.push(evt);
    if (this.evq.length > 200) this.evq.shift();
    this.onEvent?.(evt);
    return evt;
  }
  get day() { return Math.min(TOTAL_DAYS, Math.floor(this.s.hour / 24) + 1); }
  daysRemaining() { return Math.max(0, TOTAL_DAYS - this.s.hour / 24); }
  rand() { const [n, v] = rngStep(this.s.rng); this.s.rng = n; return v; }
  lvl(k) {
    const b = k === 'ops' ? this.P.opsBonus : k === 'growth' ? this.P.growthBonus : this.P.fintechBonus;
    return clamp(this.s.skills[k] + (b || 0), 0, SKILL_MAX + 2);
  }
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
  xp(n) { this.s.xp += Math.round(n * this.P.xpMult); this._levelCheck(); }
  level() { return Math.floor(Math.sqrt(this.s.xp / 100)) + 1; }
  /** Each new level grants one skill point (spendPoint). */
  _levelCheck() {
    const s = this.s;
    while (this.level() > s.lvlPaid) {
      s.lvlPaid++; s.points++;
      this.note('good', `Level ${s.lvlPaid}. You earned a skill point.`, { level: s.lvlPaid });
      this.emit('level', { level: s.lvlPaid });
    }
  }
  burnedOut() { return this.s.hour < this.s.ps.burnoutUntil; }
  /** A fraction of profit is garnished while the Business-School Grad's student loans last. Returns what was taken. */
  garnish(profit) {
    const g = this.P.garnish, s = this.s;
    if (!g || profit <= 0 || s.ps.garnished >= g.cap) return 0;
    const take = Math.min(profit * g.rate, g.cap - s.ps.garnished);
    s.ps.garnished += take; s.cash -= take;
    this.led('garnish', 'Student-loan garnishment', -take);
    return take;
  }

  mods() {
    if (this._m && this._m.h === this.s.hour) return this._m;
    const m = { h: this.s.hour, day: this.day, demand: [], price: [], speed: [], fee: 0, rateBps: 0, overhead: 1, repair: 1, intlSlow: 0, freeze: false };
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
    const sf = this.P.shockSoften; // the Veteran's shocks land softer
    if (sf) {
      const soft = (e) => ({ ...e, mult: 1 + (e.mult - 1) * (1 - sf) });
      m.demand = m.demand.map(soft); m.price = m.price.map(soft); m.speed = m.speed.map(soft);
      m.fee *= 1 - sf; m.rateBps *= 1 - sf; m.overhead = 1 + (m.overhead - 1) * (1 - sf); m.repair = 1 + (m.repair - 1) * (1 - sf); m.intlSlow *= 1 - sf;
    }
    return (this._m = m);
  }
  crowd(cls, zone) {
    const c = this.env.cohort?.counts(this.s.hour, zone, cls);
    let m = c ? 1 - 0.4 * Math.min(1, c.total / 220) : 1;
    const vol = this.P.volatility; // the Creator's algorithm whiplash: non-trend demand swings every three days
    if (vol && !ASSETS[cls].tags.includes('trend')) m *= 1 + vol * (hash01(this.s.seed + ':v' + Math.floor(this.day / 3) + cls) * 2 - 1);
    return m;
  }
  perkValue(cls) {
    const t = ASSETS[cls].tags;
    return (t.includes('trend') ? this.P.trendMult : 1) * (t.includes('digital') ? this.P.digitalMult : 1);
  }
  val(a, zone = a.zone) { return assetFMV(a, zone, this.mods(), this.crowd(a.cls, zone)) * this.perkValue(a.cls); }
  fintechMult() { return Math.max(0.5, 1 - 0.06 * (this.lvl('fintech') - 1)); }
  instFee(channel) {
    if (channel === 'p2p') return 0;
    return (FEES.base + this.mods().fee) * this.fintechMult() * this.env.difficulty.friction * this.P.feeMult * this.B.feeMult;
  }
  zoneTax(z) { return ZONES[z].tax * this.env.difficulty.friction; }
  liqDelay(zone) { return zone >= 13 ? 48 : zone >= 9 ? 24 : 0; } // governance drag grows with the stakes
  loanRate(prod) {
    if (prod === 'circle') return 0; // the Community Circle charges no interest
    const spread = LOANS[prod].spread * Math.max(0.2, 1 + (this.P.spreadAdj || 0)) * this.B.spreadMult;
    return (BASE_RATE + this.mods().rateBps / 10000 + spread) * Math.max(0.45, 1 - 0.07 * (this.lvl('fintech') - 1));
  }
  storeCap(zone) { return ZONES[zone].store + this.B.storeBonus; }
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
    for (const z of s.zones) s.pool[z] = Math.min(ZONES[z].pool, s.pool[z] + ZONES[z].pool * 0.35 / 24);
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
    const was = s.insolvent;
    s.insolvent = nw <= 0 && !s.exit;
    if (s.insolvent && !was) this.emit('insolvent');
  }

  // ------------------------------------------------------------------ milestones, events
  _unlock() {
    const s = this.s, nw = this.netWorth();
    for (const id of ZONE_IDS) {
      if (s.zones.includes(id)) continue;
      const Z = ZONES[id];
      if (nw < Z.gate) break; // gates ascend
      this._openZone(id);
      this.note('good', `${Z.name} is open. ${Z.blurb}`, { zone: id });
      this.emit('zone', { id });
    }
    for (const [k, z] of Object.entries(MIL_ZONE)) {
      if (s.mil[k] || !s.zones.includes(z)) continue;
      s.mil[k] = true;
      const n = +k.slice(1);
      if (k === 'm2') s.auditNext = s.hour;
      this.note(k === 'm2' ? 'warn' : 'good',
        k === 'm1' ? `Milestone 1: ${money(MIL.m1)} net worth. Managers, clients and the Commercial Bank are open.`
          : k === 'm2' ? `Milestone 2: ${money(MIL.m2)} net worth. A mandatory Regulatory Audit is coming. Automation expansion is locked until you file.`
            : `Milestone 3: ${money(MIL.m3)} net worth. Enterprise clients, M&A and IPO preparation are open.`, { milestone: n });
      this.emit('milestone', { n });
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
        this.emit('shock', { kind: ev.kind });
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
    s.leads[z] = (s.leads[z] || []).filter((l) => l.exp > s.hour);
    if (byClock) {
      if (this.burnedOut()) return;
      const far = z > 8 ? this.P.farLeadMult : 1;
      const good = s.hour < s.ps.goodwillUntil ? 0.5 : 1; // a failed pitch costs the Creator some goodwill
      const mult = (1 + 0.15 * (this.lvl('growth') - 1)) * (s.upg.seo ? 1.5 : 1) * this.P.leadMult * this.B.leadMult * far * good * (0.85 + 0.003 * s.rep);
      const every = Math.max(1, Math.round(Z.leadEvery * ECON.leadEvery / mult));
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
        if (fmv < 2) budget = Math.min(budget, BUYERS[seg].budget[1]);
      }
    } else {
      // the Creator draws trend buyers for anything held; the Digital Native meets digital buyers in any district
      if (this.P.trendBuyers && mine.length && this.rand() < this.P.trendBuyers * 0.5) {
        const c = segs.filter((id) => (BUYERS[id].like.trend || 0) >= 0.5);
        if (c.length) seg = c[Math.floor(this.rand() * c.length)];
      } else if (this.P.digitalBuyers && this.rand() < 0.25) {
        const c = Object.keys(BUYERS).filter((id) => BUYERS[id].zone !== z && (BUYERS[id].like.digital || 0) >= 0.8 && BUYERS[id].budget[1] >= Z.scale * 0.3 && BUYERS[id].budget[0] <= Z.scale * 4);
        if (c.length) seg = c[Math.floor(this.rand() * c.length)];
      }
    }
    const B = BUYERS[seg];
    if (budget == null) budget = B.budget[0] + (B.budget[1] - B.budget[0]) * this.rand() ** 3;
    budget *= this.P.leadBudget * (1 + this.P.loyalty * Math.min(1, (s.loyal[seg] || 0) / 3));
    budget = clamp(budget, B.budget[0], Math.max(B.budget[1] * this.P.leadBudget, B.budget[0]));
    const scam = !!this.P.scamRate && this.rand() < this.P.scamRate;
    s.leads[z].push({ id: 'L' + s.nid++, zone: z, seg, budget: Math.round(budget * 100) / 100, need, born: s.hour, exp: s.hour + 18 + Math.floor(this.rand() * 19), ...(scam ? { scam: true } : {}) });
  }
  _weighted(items, wf) {
    const ws = items.map(wf);
    let r = this.rand() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  _spawnLot(z, byClock = false) {
    const s = this.s, Z = ZONES[z];
    s.lots[z] = (s.lots[z] || []).filter((l) => l.exp > s.hour);
    const every = Math.max(2, Math.round(Z.lotEvery * ECON.lotEvery * (1 - this.P.lotRefresh)));
    if (byClock && s.hour % every !== 0) return;
    if (s.lots[z].length >= ECON.lotSlots + this.B.lotSlots) return;
    const nw = Math.max(10, this.netWorth());
    const classes = Object.keys(ASSETS).filter((c) => {
      const d = ASSETS[c];
      if (demandOf(d, z) < 3) return false;
      const v = d.base * 0.8;
      return v >= Z.scale * 0.04 && v <= Math.max(Z.scale * 5, nw * 6);
    });
    if (!classes.length) return;
    const cls = classes[Math.floor(this.rand() * classes.length)], def = ASSETS[cls];
    const cond = def.repair && this.rand() < (Z.rules.repair ? 0.6 : 0.4) ? 'broken' : 'ok';
    const asset = { cls, cond, quality: 1, wear: 1 };
    const asIs = assetFMV(asset, z, this.mods(), this.crowd(cls, z));
    const ops = this.lvl('ops');
    let disc = cond === 'ok' ? Math.max(ECON.lotDiscLo, ECON.lotDiscHi - 0.025 * (ops - 1)) : Math.max(0.8, 1 - 0.03 * (ops - 1));
    if (cond === 'broken') disc *= 1 - this.P.brokenDiscount;
    if (asIs < Z.scale * 0.6) disc *= 1 - (this.P.lotDiscount || 0); // small lots (the Side-Hustler)
    if (Z.rules.gray) disc *= 1 - (this.P.lotDiscountGray || 0); // gray markets (the Second-Chance Hustler)
    // What the seller does not say: the real condition, and whether it is genuine. Posted prices describe the lot "as described".
    const q = z <= 2 ? 0.85 + this.rand() * 0.3 : 0.7 + this.rand() * 0.45;
    const fake = cond === 'ok' && this.rand() < (Z.rules.fakes || 0) * (def.fakeRisk ?? 1);
    const labels = ['worn finish', 'loose fittings', 'faded markings', 'missing parts', 'failing seal', 'hairline cracks'];
    const defects = labels.filter((_, i) => i < Math.round((1 - q) * 8 + (fake ? 1 : 0))).map((label, i) => ({ id: 'd' + i, label }));
    const mode = Z.rules.auction && this.rand() < Z.rules.auction ? 'auction' : 'fixed';
    s.lots[z].push({
      id: 'T' + s.nid++, zone: z, cls, cond, price: Math.max(0.01, Math.round(asIs * disc * 100) / 100), exp: s.hour + 24 + Math.floor(this.rand() * 24), mode,
      truth: { q: Math.round(q * 100) / 100, fake, defects }, ...(this.P.fakeDetect && fake ? { warn: true } : {}),
    });
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
      if (demandOf(ASSETS[cls], zone) <= 0) continue;
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
  acceptsBroken(seg) {
    const l = BUYERS[seg].like;
    return (l.scrap || 0) >= 0.5 || (l.industrial || 0) >= 0.7 || (l.vehicle || 0) >= 0.8;
  }
  /** deal = { mult } from the Deal Room (pitch angle x haggle result). Clamped here, so no game can break the economy. */
  quotePitch(assetId, leadId, deal) {
    const s = this.s, a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail('Pick an asset from your inventory.');
    let lead = null;
    for (const z of s.zones) lead = lead || (s.leads[z] || []).find((l) => l.id === leadId);
    if (!lead) return fail('That buyer has left.');
    if (a.zone !== lead.zone) return fail(`Your ${ASSETS[a.cls].name} is in ${ZONES[a.zone].short}. Freight it to ${ZONES[lead.zone].short} first.`);
    const def = ASSETS[a.cls], z = lead.zone;
    if (demandOf(def, z) <= 0) return fail(`Nobody in ${ZONES[z].short} wants ${def.name}.`);
    if (a.cond === 'broken' && !this.acceptsBroken(lead.seg)) return fail('This buyer will not take a broken asset. Repair it first, or sell to someone who works with scrap and spares.');
    let fit = fitOf(a.cls, lead.seg);
    if (lead.need) fit = def.tags.includes(lead.need) ? 1 : fit * 0.5;
    const ci = this.cmFor(z, a.cls, lead.seg);
    const fmv = this.val(a);
    const B = BUYERS[lead.seg];
    const counterfeit = !!a.truth?.fake; // the buyer checks what you are selling
    const qual = a.truth && !a.truth.fake ? a.truth.q : 1;
    const ref = lead.need ? lead.budget : fmv * (a.known ? 1 : qual);
    const term = lead.need ? 0.55 + 0.45 * fit : fitMult(fit);
    const hustle = this.P.pitchMult;
    const dealMult = clamp(deal?.mult ?? 1, 0.6, 1.4);
    const rejected = fit < 0.15 || counterfeit;
    let price = rejected ? 0 : ref * term * CM.pitchBase * ECON.pitchK * ci.cm * this.growthMult() * hustle * dealMult * (lead.need ? qual : 1);
    const capped = price > lead.budget;
    price = Math.min(price, lead.budget);
    const tax = this.zoneTax(z), fee = this.instFee('pitch');
    const net = price * (1 - tax - fee);
    let goods = null, change = net;
    if (!rejected && B.holds) {
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
      ok: true, rejected, reason: counterfeit ? 'counterfeit' : fit < 0.15 ? 'nofit' : null, scam: !!lead.scam && !lead.verified, fit, fmv, ci, price, capped, tax, fee, net, goods, change, received,
      lead, asset: a, zone: z, mods: this.mods(), deal: dealMult,
      gain: fmv > 0 ? received / fmv - 1 : 0, profit: received - (a.basis || 0), parts: { ref, term, base: CM.pitchBase, cm: ci.cm, growth: this.growthMult(), hustle, deal: dealMult, quality: qual },
    };
  }
  pitch(assetId, leadId, deal) {
    const q = this.quotePitch(assetId, leadId, deal);
    if (!q.ok) return q;
    const s = this.s, a = q.asset, z = q.zone;
    s.leads[z] = s.leads[z].filter((l) => l.id !== leadId);
    s.trades++;
    const evt = (outcome, extra = {}) => this.emit('pitch', { zone: z, cls: a.cls, seg: q.lead.seg, outcome, gain: q.gain, cm: q.ci.cm, S: q.ci.S, fit: q.fit, price: q.price, mult: q.deal, ...extra });
    if (q.scam) {
      // an unverified fraudulent buyer: the goods go, the money never comes
      s.assets = s.assets.filter((x) => x.id !== a.id);
      s.streak = 0; s.rep = clamp(s.rep - 10, 0, 100);
      this.led('pitch', `${ASSETS[a.cls].name} went to a fraudulent buyer and was never paid for.`, -(a.basis || 0), { z });
      this.note('bad', 'Scam: the payment bounced and the buyer vanished. Verify buyers before you ship (Digital Natives attract these).');
      evt('rejected', { gain: -1 });
      return ok('Scammed.', { ...q, outcome: 'scam' });
    }
    if (q.rejected) {
      s.streak = 0;
      if (q.reason === 'counterfeit') { a.known = true; s.rep = clamp(s.rep - 3, 0, 100); this.note('bad', `The ${BUYERS[q.lead.seg].name} spotted a counterfeit. That ${ASSETS[a.cls].name} is worth almost nothing.`); }
      if (this.P.flopRep) { s.rep = clamp(s.rep - this.P.flopRep, 0, 100); s.ps.goodwillUntil = s.hour + 48; }
      this.led('pitch', `Pitched ${ASSETS[a.cls].name} to ${BUYERS[q.lead.seg].name}: rejected (${q.reason === 'counterfeit' ? 'counterfeit' : 'no fit'}).`, 0, { z });
      evt('rejected', { gain: 0 });
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
    this.garnish(q.profit);
    const win = q.received > q.fmv * 1.02;
    s.streak = win ? s.streak + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (win) { s.rep = clamp(s.rep + 1, 0, 100); s.loyal[q.lead.seg] = (s.loyal[q.lead.seg] || 0) + 1; } else if (this.P.flopRep) { s.rep = clamp(s.rep - this.P.flopRep / 2, 0, 100); s.ps.goodwillUntil = s.hour + 48; }
    const xp = win ? 40 + 60 * clamp(Math.log10(1 + q.gain), 0, 3) + s.streak * 5 : 5;
    this.xp(xp);
    this.led('pitch', `${ASSETS[a.cls].name} to ${BUYERS[q.lead.seg].name}${got ? ' for ' + got : ''}`, q.received - q.fmv, { z, cm: q.ci.cm, S: q.ci.S, vN: q.ci.vN, vT: q.ci.vT, cls: a.cls, seg: q.lead.seg, fmv: q.fmv, recv: q.received });
    const outcome = q.ci.band.id === 'pioneer' ? 'pioneer' : q.ci.band.id === 'herd' ? 'herd' : win ? 'win' : 'flat';
    evt(outcome);
    if (win && s.streak >= 2) this.emit('streak', { n: s.streak });
    return ok(win ? 'Successful arbitrage.' : 'Traded, no gain.', { ...q, outcome, xp: Math.round(xp), gotName: got });
  }
  /** Players may check a buyer before they ship (the Digital Native's scam magnet). Costs 1% of the buyer's budget. */
  verifyLead(leadId) {
    const s = this.s;
    let lead = null;
    for (const z of s.zones) lead = lead || (s.leads[z] || []).find((l) => l.id === leadId);
    if (!lead) return fail('That buyer has left.');
    if (lead.verified) return ok('Already verified.', { scam: !!lead.scam });
    const cost = Math.max(0.01, Math.round(lead.budget * 0.01 * 100) / 100);
    if (s.cash < cost) return fail(`Verification costs ${money(cost)}.`);
    s.cash -= cost; lead.verified = true;
    this.led('verify', 'Checked a buyer\'s credentials', -cost);
    return ok(lead.scam ? 'Fraud confirmed. Skip this buyer.' : 'Verified: this buyer is genuine.', { scam: !!lead.scam, cost });
  }
  /** What the Deal Room needs to simulate a lot: the lot's hidden truth. Evidence from Inspect is noisy, so this is not a leak. */
  lotTruth(zone, lotId) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    return lot ? { ...lot.truth, defects: lot.truth.defects.map((d) => ({ ...d })) } : null;
  }
  /** The Deal Room's Read stage reports what the player learned; the lot (and the crate it becomes) remembers the belief. */
  recordInspect(zone, lotId, res) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot || !res?.estimate) return fail('That lot is gone.');
    lot.belief = { quality: res.estimate.quality, fakeProb: res.estimate.fakeProb, confidence: res.confidence ?? 0 };
    const caught = lot.truth.fake && res.estimate.fakeProb >= 0.6;
    const score = clamp(res.score ?? 0.5, 0, 1);
    this.xp(8 + 22 * score);
    this._tally('inspect', score, !!res.quick);
    this.emit('inspect', { score, fake: lot.truth.fake, caught });
    return ok('Recorded.', { caught });
  }
  /** Per-game play counts for the debrief and the instructor: s.meta[kind] = { n, sum } (sum of scores), plus how many deals were played by hand and how many were Quick. */
  _tally(kind, score, quick) {
    const m = (this.s.meta ||= {});
    const t = (m[kind] ||= { n: 0, sum: 0 });
    t.n++; t.sum += score;
    if (quick) m.quick = (m.quick || 0) + 1; else m.played = (m.played || 0) + 1;
  }
  /** A skill game played for its own sake (haggle, auction, repair) pays a little XP for good play. */
  recordPlay(kind, res) {
    const score = clamp(res?.score ?? 0.5, 0, 1);
    this.xp(6 + 24 * score);
    this._tally(kind, score, !!res?.quick);
    if (kind === 'haggle') this.emit('haggle', { role: res.role || 'sell', mult: res.mult ?? 1, score, deal: !!res.deal });
    if (kind === 'auction') this.emit('auction', { won: !!res.won, price: res.price ?? 0, surplus: res.surplus ?? 0 });
  }
  /** deal = { mult } (a Haggle or Auction result as a share of the posted price), clamped to 0.6..1.4. */
  buyQuote(zone, lotId, deal) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot) return fail('That lot is gone.');
    const mult = clamp(deal?.mult ?? 1, 0.6, 1.4);
    return ok('', { lot, mult, price: Math.max(0.01, Math.round(lot.price * mult * 100) / 100) });
  }
  /** A lot the player lost at auction goes to another bidder. */
  passLot(zone, lotId, why = '') {
    const s = this.s, lot = s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot) return fail('That lot is gone.');
    s.lots[zone] = s.lots[zone].filter((l) => l.id !== lotId);
    if (why) this.note('info', why);
    return ok('Lot gone.');
  }
  buyLot(zone, lotId, deal) {
    const s = this.s, q = this.buyQuote(zone, lotId, deal);
    if (!q.ok) return q;
    const lot = q.lot, price = q.price;
    if (s.cash < price) return fail(`Need ${money(price)}; you have ${money(s.cash)}.`);
    const held = s.assets.filter((a) => a.zone === zone).length + s.freight.reduce((n, f) => n + (f.to === zone ? f.items.length : 0), 0) + s.escrow.reduce((n, e) => n + e.assets.filter((a) => a.zone === zone).length, 0);
    if (held >= this.storeCap(zone)) return fail('Storage is full here (crates in transit and in escrow count). Sell something or ship it out.');
    s.cash -= price;
    s.lots[zone] = s.lots[zone].filter((l) => l.id !== lotId);
    const a = this._mk(s, lot.cls, { cond: lot.cond, zone, basis: price, from: 'lot' });
    a.truth = lot.truth; a.known = false; a.belief = lot.belief || null;
    s.assets.push(a);
    this.led('buy', `Bought ${ASSETS[lot.cls].name}${lot.cond === 'broken' ? ' (broken)' : ''}`, -price, { z: zone });
    this.emit('buy', { zone, cls: lot.cls, price, fake: lot.truth.fake, cond: lot.cond });
    return ok('Purchased.', { asset: a, price });
  }
  repairMultFor(zone) { return (1 - (ZONES[zone].rules.repair || 0)) * (zone > 4 ? this.mods().repair : 1) * this.P.repairMult * this.B.repairMult; }
  repairQuote(assetId, deal) {
    const a = this.s.assets.find((x) => x.id === assetId);
    if (!a) return fail('No such asset.');
    const def = ASSETS[a.cls];
    if (a.cond !== 'broken' || !def.repair) return fail('Nothing to repair.');
    const ops = this.lvl('ops');
    const cost = repairCostFor(def.repair, ops, this.repairMultFor(a.zone)) * clamp(deal?.costMult ?? 1, 0.9, 1.3);
    const q = clamp(restoreQuality(ops) * clamp(deal?.qualityMult ?? 1, 0.85, 1.15), 0.3, 1.15);
    const after = assetFMV({ ...a, cond: 'ok', quality: q }, a.zone, this.mods(), this.crowd(a.cls, a.zone)) * this.perkValue(a.cls);
    return ok('', { cost, quality: q, before: this.val(a), after, asset: a });
  }
  repairQuoteFor(cls, zone) {
    const def = ASSETS[cls], ops = this.lvl('ops');
    const cost = def.repair ? repairCostFor(def.repair, ops, this.repairMultFor(zone)) : 0, quality = restoreQuality(ops);
    const after = assetFMV({ cls, cond: 'ok', quality, wear: 1 }, zone, this.mods(), this.crowd(cls, zone)) * this.perkValue(cls);
    return { cost, quality, after };
  }
  repair(assetId, deal) {
    const q = this.repairQuote(assetId, deal);
    if (!q.ok) return q;
    if (this.s.cash < q.cost) return fail(`Repair costs ${money(q.cost)}.`);
    this.s.cash -= q.cost;
    q.asset.cond = 'ok'; q.asset.quality = q.quality; q.asset.basis += q.cost;
    this.xp(20);
    this.led('repair', `Repaired ${ASSETS[q.asset.cls].name} to ${Math.round(q.quality * 100)}% quality`, -q.cost, { z: q.asset.zone });
    this.emit('repair', { cls: q.asset.cls, cost: q.cost, quality: q.quality, precision: clamp(deal?.precision ?? 0.5, 0, 1) });
    return ok('Repaired.', q);
  }
  /** The district where digital goods fetch most when routed (the Digital Native's remote sale). */
  bestZone(items) {
    let best = null, bv = -1;
    for (const z of this.s.zones) { const v = items.reduce((x, a) => x + this.val(a, z), 0); if (v > bv) { bv = v; best = z; } }
    return best;
  }
  poolQuote(ids, route = false) {
    const s = this.s, items = ids.map((id) => s.assets.find((a) => a.id === id)).filter(Boolean);
    if (!items.length) return fail('Select assets to sell.');
    if (route && (s.zones.length < 2 || items.some((a) => !ASSETS[a.cls].tags.includes('digital')))) return fail('Digital routing needs a second district and digital assets.');
    const zone = route ? this.bestZone(items) : items[0].zone;
    if (!route && items.some((a) => a.zone !== zone)) return fail('Sell assets from one district at a time.');
    const fric = route ? FEES.digitalRouting : ZONES[zone].friction + this.instFee('pool');
    const per = items.map((a) => ({ a, value: this.val(a, zone) * (1 - fric) * (a.known ? 1 : truthMult(a)) }));
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
    for (const { a } of q.per) { this.logNiche(q.zone, a.cls, 'npc-pool', CM.ref); }
    if (q.delay) s.settle.push({ amt: q.total, at: s.hour + q.delay, note: 'Liquidation settlement' });
    else s.cash += q.total;
    this.garnish(q.total - q.per.reduce((x, y) => x + (y.a.basis || 0), 0));
    s.pivot++;
    this.led('pool', `Sold ${q.per.length} asset(s) to the ${ZONES[q.zone].short} liquidity pool${q.delay ? ' (settles in ' + q.delay + 'h)' : ''}`, q.total, { z: q.zone });
    this.emit('sell-pool', { zone: q.zone, total: q.total, count: q.per.length });
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
    if (!s.zones.includes(to)) return fail('You do not have access to that district yet.');
    const from = items[0].zone;
    if (items.some((a) => a.zone !== from) || from === to) return fail('Pick assets from one district and a different destination.');
    const book = items.reduce((x, a) => x + this.val(a), 0);
    const hops = Math.abs(to - from);
    const hasLog = s.pipes.some((p) => p.kind === 'logistics');
    const dist = Math.min(3, 1 + 0.25 * (hops - 1));
    const cost = book * FRESH.freightCost * dist * (s.upg.freight ? 0.6 : 1) * (hasLog ? 0.8 : 1) * this.P.freightMult * this.B.freightMult;
    const risk = clamp(FRESH.damageBase - 0.05 * this.lvl('ops'), 0.03, 0.3) * (hasLog ? 0.5 : 1);
    const room = this.storeCap(to) - s.assets.filter((a) => a.zone === to).length - s.freight.filter((f) => f.to === to).reduce((x, f) => x + f.items.length, 0);
    const hours = Math.max(2, Math.round(FRESH.freightHours * Math.min(2.5, 1 + 0.1 * (hops - 1)) * (1 - this.P.freightSpeed)));
    return ok('', { items, from, to, book, cost, risk, hours, room, hops });
  }
  ship(ids, to) {
    const q = this.freightQuote(ids, to);
    if (!q.ok) return q;
    const s = this.s;
    if (q.items.length > q.room) return fail('The destination does not have room for all of that.');
    if (s.cash < q.cost) return fail(`Freight costs ${money(q.cost)}.`);
    s.cash -= q.cost;
    s.assets = s.assets.filter((a) => !ids.includes(a.id));
    s.freight.push({ id: 'F' + s.nid++, items: q.items, to, arrive: s.hour + q.hours, risk: q.risk, book: q.book, from: q.from });
    this.led('freight', `Shipped ${q.items.length} asset(s) to ${ZONES[to].short}`, -q.cost, { z: to });
    this.emit('ship', { from: q.from, to, count: q.items.length });
    return ok(`In transit for ${q.hours} virtual hours.`, q);
  }
  _freight() {
    const s = this.s;
    if (!s.freight.length) return;
    for (const f of s.freight.filter((x) => x.arrive <= s.hour)) {
      const cu = ZONES[f.to].rules.customs;
      if (cu && !f.checked) {
        f.checked = true;
        if (this.rand() < cu) {
          const fee = Math.min(Math.max(0, s.cash), (f.book || 0) * 0.02);
          s.cash -= fee; f.arrive = s.hour + 12;
          this.led('customs', `Customs inspected freight bound for ${ZONES[f.to].short}`, -fee, { z: f.to });
          this.note('warn', `Customs inspected your freight in ${ZONES[f.to].short}: 12 hours' delay and a ${money(fee)} fee.`);
          continue;
        }
      }
      for (const a of f.items) {
        a.zone = f.to;
        if (this.rand() < f.risk) { a.quality *= 0.8; this.note('bad', `${ASSETS[a.cls].name} was damaged in transit (-20% quality). Higher Ops and a Logistics Agent cut this risk.`); }
        s.assets.push(a);
      }
      this.note('info', `Freight arrived in ${ZONES[f.to].short}.`);
    }
    s.freight = s.freight.filter((x) => x.arrive > s.hour);
  }
  /** Spend a skill point (earned by levelling up). Cash training is gone: skill is earned by play. */
  spendPoint(skill) {
    const s = this.s, l = s.skills[skill];
    if (l == null) return fail('Unknown skill.');
    if (l >= SKILL_MAX) return fail('Already at mastery.');
    if (s.points < 1) return fail('No skill points. Every level you earn gives one.');
    s.points--; s.skills[skill]++;
    this.xp(10);
    this.led('train', `Raised ${SKILLS[skill].short} to level ${l + 1}`, 0);
    this.emit('skill', { skill, level: l + 1 });
    return ok(`${SKILLS[skill].short} is now level ${l + 1}.`);
  }

  // ------------------------------------------------------------------ automation
  autoLocked() {
    const s = this.s;
    return s.mil.m2 && (!s.auditFirst || !!s.auditPending);
  }
  pipeCost(kind, zone) {
    const n = this.s.pipes.filter((p) => p.zone === zone).length;
    return PIPE[kind].hire * pipeScale(ZONES[zone]) * Math.pow(PIPE_RULES.hireGrowth, n) * this.P.managerCost;
  }
  pipeCap(p) { return PIPE[p.kind].cap * pipeScale(ZONES[p.zone]) * Math.pow(2, p.level - 1) * this.B.capMult; }
  pipeUpCost(p) { return PIPE[p.kind].hire * pipeScale(ZONES[p.zone]) * Math.pow(PIPE_RULES.levelGrowth, p.level) * 1.5 * this.P.managerCost; }
  cycleLen(p) {
    const s = this.s, K = PIPE[p.kind], def = ASSETS[p.cls || 'pen'], m = this.mods();
    let len = ECON.cycleBase / ZONES[p.zone].speed * K.cycle / (1 + 0.15 * (this.lvl('growth') - 1));
    if (s.upg.jit) len *= 0.8;
    len /= p.cls ? speedMult(def, p.zone, m) : 1;
    if (p.channel === 'intl') len += m.intlSlow;
    if (s.velPenalty < 1) len /= s.velPenalty;
    return Math.max(3, Math.round(len * this.P.cycleMult));
  }
  forecast(p) {
    const s = this.s, K = PIPE[p.kind], m = this.mods(), z = p.zone;
    const alloc = Math.min(p.alloc || 0, this.pipeCap(p));
    const ci = p.cls && p.buyer ? this.cmFor(z, p.cls, p.buyer) : { cm: CM.ref, S: 0, vN: 0, vT: 0, band: creativityBand(CM.ref) };
    const rel = ci.cm / CM.ref;
    const def = p.cls ? ASSETS[p.cls] : null;
    const lane = def ? Math.sqrt(demandMult(def, z, m)) * priceMult(def, z, m) : 1;
    const learn = p.kind === 'student' ? Math.min(0.03, (p.cycles || 0) / 10 * 0.005) : 0;
    const margin = (K.margin + learn) * ECON.margin * pipeMargin(ZONES[z]) * (p.channel === 'intl' ? 1.3 + this.P.intlBonus : 1) * (s.upg.seo ? 1.08 : 1);
    const gross = alloc * margin * rel * lane;
    const fee = (alloc + gross) * this.instFee('pipe');
    const tax = Math.max(0, gross) * this.zoneTax(z);
    const roy = Math.max(0, gross) * K.royalty;
    const ov = this.P.overheadMult * m.overhead * Math.max(0.5, 1 - 0.04 * (this.lvl('ops') - 1)) * (s.upg.jit ? 0.9 : 1);
    const overhead = (K.overhead * pipeOverhead(ZONES[z]) + 0.002 * alloc) * ov;
    const net = gross - fee - tax - roy - overhead;
    const len = this.cycleLen(p);
    return { alloc, ci, rel, margin, gross, fee, tax, roy, overhead, net, len, perDay: net * 24 / len, cap: this.pipeCap(p) };
  }
  validLane(zone, cls, buyer) {
    if (!cls || !buyer) return fail('Choose an asset class and a buyer segment.');
    if (!ASSETS[cls] || demandOf(ASSETS[cls], zone) <= 0) return fail('That asset has no market in this district.');
    if (!BUYERS[buyer] || BUYERS[buyer].zone !== zone) return fail('That buyer is not in this district.');
    if (fitOf(cls, buyer) < 0.3) return fail('That buyer has almost no use for that asset.');
    return ok();
  }
  hirePipeline(kind, zone, cfg = {}) {
    const s = this.s;
    if (!PIPE[kind]) return fail('Unknown manager.');
    if (!ZONES[zone].auto) return fail('No managers can work in this district. Everything here is done by hand.');
    if (!s.zones.includes(zone)) return fail('You do not have access to that district.');
    if (this.autoLocked()) return fail('Gate 2: automation expansion is locked until you resolve your Regulatory Audit.');
    if (s.pipes.filter((p) => p.zone === zone).length >= ZONES[zone].plots) return fail('All management slots in this district are filled.');
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
    this.emit('hire', { kind, zone });
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
    this.emit('pipe-level', { id: p.id, level: p.level });
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
    if (!s.zones.includes(U.zone)) return fail('Unlocks at Metro Hub.');
    if (s.cash < U.cost) return fail(`Costs ${money(U.cost)}.`);
    s.cash -= U.cost; s.upg[id] = true; this.xp(100);
    this.led('upgrade', `Installed ${U.name}`, -U.cost);
    this.emit('upgrade', { id });
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
    this.garnish(f.net);
    this.emit('cycle', { zone: p.zone, net: f.net });
    this.logNiche(p.zone, p.cls, p.buyer, f.ci.cm);
    this.led('pipe', `${PIPE[p.kind].name}: ${ASSETS[p.cls].name} to ${BUYERS[p.buyer].name}`, f.net, { z: p.zone, cm: f.ci.cm, pid: p.id });
    this.xp(Math.max(1, Math.log10(Math.abs(f.net) + 1) * 4));
  }

  // ------------------------------------------------------------------ clients (CAC vs LTV)
  clientQuote(tier) {
    const s = this.s, C = CLIENTS[tier];
    const cac = C.cac * Math.max(0.5, 1 - 0.08 * (this.lvl('growth') - 1)) * (s.upg.seo ? 0.85 : 1);
    const days = C.days, ltv = C.perDay * days * (1 - this.zoneTax(C.zone));
    return { cac, ltv, ratio: ltv / cac, payback: cac / (C.perDay * (1 - this.zoneTax(C.zone))), perDay: C.perDay, days };
  }
  acquireClient(tier) {
    const s = this.s, C = CLIENTS[tier];
    if (!s.zones.includes(C.zone)) return fail('Not available in your districts yet.');
    if (C.needs && !s.mil[C.needs]) return fail(`Unlocks at Milestone ${C.needs.slice(1)}.`);
    if (s.clients.filter((c) => c.tier === tier).length >= C.max) return fail('You already hold the maximum of these accounts.');
    if (s.pipes.length < C.minRunning) return fail(`This account's SLA needs ${C.minRunning} pipeline${C.minRunning > 1 ? 's' : ''} running. Build the capacity first, then sign the client.`);
    const q = this.clientQuote(tier);
    if (s.cash < q.cac) return fail(`Acquisition costs ${money(q.cac)}.`);
    s.cash -= q.cac;
    s.clients.push({ id: 'C' + s.nid++, tier, cac: q.cac, until: s.hour + C.days * 24, earned: 0, breaches: 0 });
    this.xp(90);
    this.led('client', `Signed a ${C.name}`, -q.cac);
    this.emit('client', { tier });
    return ok('Account signed.', q);
  }
  runningPipes() { return this.s.pipes.filter((p) => p.status === 'running').length; }

  // ------------------------------------------------------------------ bank
  loanRoom(prod) {
    const s = this.s, L = LOANS[prod], mult = this.B.creditLimitMult;
    const owed = s.loans.filter((l) => l.prod === prod).reduce((a, l) => a + l.principal + l.accr, 0);
    let lim;
    if (prod === 'pipeline') lim = L.limitPct * (this.invValue() + s.pipes.reduce((a, p) => a + p.basis, 0));
    else if (prod === 'circle') lim = (this.P.circle?.pct || 0) * Math.max(0, this.netWorth() + owed);
    else lim = L.limit * mult;
    const de = Math.max(0, DEBT.maxDE * this.netWorth() - this.debt());
    return { limit: lim, owed, room: Math.max(0, Math.min(lim - owed, de)), de };
  }
  loanBlock(prod) {
    const s = this.s;
    if (prod === 'circle') return this.P.circle ? '' : 'You are not part of a Community Circle.';
    if (!s.mil.m1) return 'The Commercial Bank opens at Metro Hub ($1,000 net worth).';
    if (this.P.bankMinNW > 0 && this.netWorth() < this.P.bankMinNW) return `No bank will lend to you yet: your record asks for ${money(this.P.bankMinNW)} net worth first.`;
    if (this.mods().freeze) return 'Credit Action Override: no new loans until the freeze lifts.';
    if (LOANS[prod].zone && !s.zones.includes(LOANS[prod].zone)) return 'Needs Corporate Valley.';
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
    this.emit('draw', { prod, amount });
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
    this.emit('repay', { amount });
    return ok(`Repaid ${money(amount)}.`);
  }
  _marginCall() {
    const s = this.s;
    if (!s.loans.length || this.deRatio() <= DEBT.callDE || !(s.pipes.length || s.assets.length)) return;
    this.emit('margin-call');
    if (s.ps.bailout > 0) {
      // the Legacy Heir's family clears part of the debt, once
      s.ps.bailout--;
      const frac = this.P.bailout.fraction;
      for (const l of s.loans) { l.principal *= 1 - frac; l.accr *= 1 - frac; }
      this.led('bailout', 'The family cleared part of your debt', 0);
      this.note('good', `The family stepped in and cleared ${Math.round(frac * 100)}% of your debt. That safety net is now used up.`);
      this.emit('perk', { id: 'heir', effect: 'bailout' });
      if (this.deRatio() <= DEBT.callDE) return;
    }
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
    for (const a of s.assets) {
      const d = ASSETS[a.cls], Z = ZONES[a.zone];
      let decay = d.dep * 0.002 * (s.upg.jit ? 0.5 : 1);
      if (Z.rules.fads && d.tags.includes('digital')) decay *= 2; // fads: digital goods lose value twice as fast
      a.wear *= 1 - decay;
      if (d.perish) a.wear *= 1 - 0.8 / d.perish; // perishables spoil
    }
    let dayProfit = s.acc.profit;
    // assets that pay while you hold them (royalties, rent)
    let yieldIn = 0;
    const byZone = {};
    for (const a of s.assets) {
      const d = ASSETS[a.cls];
      if (!d.yield) continue;
      const inc = this.val(a) * d.yield * (d.tags.includes('realty') || ZONES[a.zone].rules.rent ? this.B.rentMult : 1);
      yieldIn += inc; byZone[a.zone] = (byZone[a.zone] || 0) + inc;
    }
    if (yieldIn > 0) {
      s.cash += yieldIn; dayProfit += yieldIn; this.led('rent', 'Royalties and rent', yieldIn);
      for (const [z, net] of Object.entries(byZone)) this.emit('cycle', { zone: +z, net }); // royalties and rent count as a cycle of income for quests
    }
    // the costs of the two Backgrounds you chose
    const Pm = this.P;
    if (Pm.familyTax && s.hour % Pm.familyTax.everyHours === 0 && s.cash > 0) { const t = s.cash * Pm.familyTax.rate; s.cash -= t; dayProfit -= t; this.led('family', 'Family obligations', -t); }
    if (Pm.subscription && s.hour % 720 === 0 && s.cash > 0) { const t = s.cash * Pm.subscription.rate; s.cash -= t; dayProfit -= t; this.led('subscription', 'Tool subscriptions', -t); }
    if (Pm.burnout && day % Pm.burnout.everyDays === 0) { s.ps.burnoutUntil = s.hour + 24; this.note('warn', 'Burnout: you take a day off and no new buyers come to you.'); }
    if (Pm.mentor && day % 7 === 0) this._mentorTip();
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
          const unused = Math.max(0, LOANS.enterprise.limit * this.B.creditLimitMult - l.principal);
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
    this.emit('day', { day });
    (s.hist ||= []).push([s.hour, Math.max(0.01, this.netWorth())]);
    s.acc.profit = 0;
    const from = s.hour - 120;
    s.niche = s.niche.filter((n) => n[0] > from);
    this._algoEvent(day + 1);
    this._checkpoint();
  }
  _mentorTip() {
    let best = null;
    for (const z of this.s.zones) { const r = this.radar(z, 1)[0]; if (r && (!best || r.score > best.score)) best = { ...r, zone: z }; }
    if (best) this.note('info', `Your mentor says: look at ${ASSETS[best.cls].name} for ${BUYERS[best.seg].name} in ${ZONES[best.zone].short}. Few people are selling there, so it should pay well.`);
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
      s.auditNext = s.hour + AUDIT.everyDays * 24 / this.env.difficulty.audit / this.P.auditMult;
    }
  }
  auditFine() { return AUDIT.fine * Math.pow(1.5, this.s.auditFail) * this.P.fineMult; }
  _auditFail(ignored) {
    const s = this.s;
    let fine = this.auditFine();
    if (s.ps.fineWaive > 0) { s.ps.fineWaive--; fine = 0; this.note('good', 'The family lawyer made the first audit fine disappear.'); this.emit('perk', { id: 'heir', effect: 'fine-waived' }); }
    s.cash -= fine; s.auditFail++; s.velPenalty *= AUDIT.velocityHit;
    this.led('audit', ignored ? 'Ignored audit: automatic penalty' : 'Failed audit: fine and velocity penalty', -fine);
    this.note('bad', `${ignored ? 'You ignored the audit. ' : 'You were caught. '}Fine ${money(fine)} and a permanent -15% on pipeline velocity. Repeat failures compound.`);
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
    s.auditNext = s.hour + AUDIT.everyDays * 24 / this.env.difficulty.audit / this.P.auditMult;
    this.xp(70);
    this.emit('audit', { choice, ok: choice !== 'C' || !String(msg).startsWith('Caught') });
    return ok(msg);
  }

  // ------------------------------------------------------------------ exit (M&A / IPO)
  exitQuote(kind) {
    const s = this.s;
    if (!s.mil.m3) return fail('Exit options unlock at Corporate Valley ($250,000 net worth).');
    if (kind === 'ipo' && s.auditFail > 0) return fail('IPO preparation needs a clean compliance record. Choose a trade sale.');
    const avg = s.dp.length ? s.dp.reduce((a, b) => a + b, 0) / s.dp.length : 0;
    const mult = (kind === 'ipo' ? 10 : 6) * this.B.exitMult;
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
    this.emit('exit', { kind });
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
      const q = restoreQuality(skills.ops), cost = repairCostFor(def.repair, skills.ops, z > 4 ? mods.repair : 1);
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
    this.emit('p2p', { peer: offer.from, variance: chk.variance });
    const net = this.sideValue(offer.give) - this.sideValue(offer.want);
    this.led('p2p', `Swapped with ${offer.fromHandle || offer.from}`, net, { offer: offer.id, peer: offer.from, peerSkills: offer.skills, gave: gave.map((a) => a.cls), got: offer.give.assets.map((a) => a.cls), va: chk.va, vb: chk.vb, variance: chk.variance });
    return ok('Deal done.', { deliver: { assets: gave, cash: offer.want.cash }, chk });
  }
  /** A swapped-in asset must sit in a district this founder can enter; otherwise it is delivered to the nearest open one. */
  _home(a) {
    const s = this.s;
    if (!s.zones.includes(a.zone)) { const open = [...s.zones].sort((x, y) => y - x); a.zone = open.find((z) => z <= a.zone) ?? open[open.length - 1]; this.note('info', `${ASSETS[a.cls].name} was delivered to ${ZONES[a.zone].short}, the nearest district you can enter.`); }
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
    this.emit('p2p', { peer: o.to, variance: o.check?.variance ?? 0 });
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
      pid: s.pid, handle: s.handle, perks: [...s.perks], specialty: s.specialty, skills: { ...s.skills }, level: this.level(), hour: s.hour,
      nw, cash: s.cash, debt: this.debt(), startCap: s.startCapital, eei: this.eei(), zones: Math.max(...s.zones),
      pipelines: s.pipes.length, lastAutoHour: s.lastAuto, autoEligible: s.mil.m1 && !s.over, niches: this.niches48(),
      cmAvg: s.cm.n ? s.cm.sum / s.cm.n : 0, p2p: s.p2p, trades: s.trades, flags: { insolvent: s.insolvent, exited: !!s.exit, over: s.over },
      shockLog: s.shockLog.map((x) => ({ id: x.id, nw: x.nw, nwAfter: x.nwAfter, pivots: x.pivots, de: x.de })),
      hoursPlayed: Math.round((s.hour - s.startHour) / 24 * 10) / 10, auditFail: s.auditFail,
      inventory: s.assets.slice(0, 24).map((a) => this.pub(a)), mil: s.mil,
      plays: Object.fromEntries(['inspect', 'pitch', 'haggle', 'repair', 'auction', 'quick', 'played'].filter((k) => s.meta?.[k] != null).map((k) => [k, s.meta[k]])),
    };
  }
}

export { obviousBuyer, utilityIn };
