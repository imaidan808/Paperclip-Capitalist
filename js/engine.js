// The simulation engine. Pure JS, no DOM. One step = one virtual hour; 24 hours = 1 virtual day; 90 days = a run.
// Every student-facing action is a method that returns {ok, msg, ...}. Everything the UI shows is read from `game.s`.
import {
  TOTAL_DAYS, TOTAL_HOURS, ECON, LEVEL_XP, MIL, MIL_ZONE, CM, FEES, FMV_BAND, EEI_FLOOR_DEFAULT, BASE_RATE, DEBT, ZONES, ZONE_IDS, SKILLS, SKILL_MAX,
  PERKS, perkMods, ASSETS, BUYERS, PIPE, PIPE_RULES, pipeScale, pipeMargin, pipeOverhead, UPGRADES, CLIENTS, LOANS, AUDIT_THEMES, AUDIT, EVENTS, ALGO_EVENTS, WARN_LEAD, FRESH, SWAPS, DELIVERY_FLOOR,
} from './config.js';
import {
  clamp, creativity, creativityBand, saturation, eei as eeiCalc, fmvVariance, restoreQuality, repairCostFor, lotShare, fitOf, fitMult,
  nicheKey, assetFMV, demandMult, priceMult, speedMult, obviousBuyer, utilityIn, demandOf, truthMult, FAKE_VALUE,
} from './market.js';
import { step as rngStep, hash01 } from './rng.js';

// The message and the verdict are the caller's own: a quote spread in as `extra` must never overwrite them (a failed pool sale once came back ok with no message).
const ok = (msg, extra = {}) => ({ ...extra, ok: true, msg });
const fail = (msg, extra = {}) => ({ ...extra, ok: false, msg });
// A number from outside (the Deal Room, a peer, a test) that is not a finite number becomes the neutral default instead of poisoning cash.
const fin = (x, d) => (typeof x === 'number' && !Number.isNaN(x) ? x : d); // +-Infinity is a number: the caller's clamp turns it into the nearest bound
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); // ids come from the UI and the network: never index a plain object by them unchecked
const DE_CAP = 999; // a debt-to-equity figure that is logged or shown is finite: nothing left to divide by reads as 999, not Infinity (JSON writes Infinity as null)
const money = (x) => (x < 0 && Math.abs(x) >= 0.005 ? '-' : '') + (Math.abs(x) < 100 ? '$' + Math.abs(x).toFixed(2) : '$' + Math.round(Math.abs(x)).toLocaleString('en-US')); // -$12.50, as the rest of the product writes it, not $-12.50
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`; // "1 day", "2 days"
const uniq = (ids) => [...new Set(ids)]; // an id list from outside may repeat an id: one crate is one crate
const isNum = (x) => typeof x === 'number' && Number.isFinite(x); // a real number: not NaN, not +-Infinity, not a string (JSON turns Infinity into null)
const LEDGER_CAP = 3200, LEDGER_FOLD = 200; // see led()
const OFFER_MAX = 24; // crates in one swap: more than any district holds
const SKILL_GAMES = ['inspect', 'pitch', 'haggle', 'auction', 'repair']; // the games whose play is tallied in s.meta
const ROYALTY_MSGS = 12; // messages (each a day's rate) one stream may send in a day
const UNTRADEABLE = 'This crate cannot be traded at that price.'; // the whole of what a refusal made on a crate's hidden truth may say
const XP_CALL = 1e6, POINTS_CALL = 1000, XP_MAX = LEVEL_XP * 99 * 99; // what one grant may add (a corrupt or hostile amount), and the most XP a run can hold (level 100): the level loop below is bounded by it
const ROYALTY_NW = 0.1; // a promised royalty is worth at most this share of what its promiser is worth
const SKILL_XP_DAY = 300; // the most experience one kind of skill game pays in a virtual day: more reads than that are practice, not progress (a Quick Read of every fresh lot in every district used to double a whole run's XP)

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
    if (opts.state) this._mend();
  }
  /** A saved state is read back as it was written, and an older build wrote what a newer one does not: a shock logged with nothing left to divide by (a debt-to-equity of Infinity) was saved as null, which the debrief then
   *  took for a number. Such a figure is the cap. Nothing else is touched. */
  _mend() {
    const s = this.s;
    if (Array.isArray(s.shockLog)) for (const x of s.shockLog) if (x && typeof x === 'object' && !isNum(x.de)) x.de = DE_CAP;
    return this;
  }

  // ------------------------------------------------------------------ construction
  _new({ perks = [], handle = 'Founder', pid = 'PC-' + Math.random().toString(36).slice(2, 6).toUpperCase(), seed, specialty = 'ops', startHour = 0 }) {
    const asked = [...new Set(Array.isArray(perks) ? perks : [])];
    perks = asked.filter((id) => own(PERKS, id)).slice(0, 2);
    const unknown = asked.filter((id) => !own(PERKS, id));
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
    if (unknown.length) this.note('warn', `${unknown.slice(0, 3).map((x) => String(x).slice(0, 40)).join(', ')} ${unknown.length === 1 ? 'is not a Background' : 'are not Backgrounds'}: this run starts without ${unknown.length === 1 ? 'it' : 'them'}.`); // a typo must not quietly give a different build
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
    try { this.onEvent?.(evt); } catch (e) { console.error('engine: an event listener threw:', e); } // a listener is the page's business: a day that has half run (profit counted, history not written) is the engine's
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
  /**
   * THE LEDGER (s.ledger). It is a gain-and-cost ledger, not a cash ledger: each row is one thing the player did (or one thing that happened to them) and `amt` is the money result
   * of THAT thing. The cash balance is NOT the sum of the rows, because some rows are gains measured against fair value and some money moves between pockets (see below).
   *   Costs, `amt` = cash paid (negative): buy, repair, verify, upgrade, hire / upgrade of a manager, freight, customs, client (the acquisition cost, at signing), audit fines and fees,
   *     family, subscription, garnish, repay.   Cash in (positive): loan (the draw less its fee), rent (royalties and rent), margin (a seizure's proceeds), a manager released (hire),
   *     p2p 'Royalty received'.   Zero: train, bailout, 'Proposed a swap', an exit that has begun, an audit answered with no fee.
   *   pitch: the GAIN over fair value (received - fmv; `recv` and `fmv` hold both), 0 when the buyer rejected, minus the crate's basis when a fraudster took it and paid nothing.
   *   pool: the whole proceeds, booked at the sale (the cash lands after the delay the text names). pipe: one manager cycle's net profit (principal in flight is not a row).
   *   p2p 'Swapped with' / 'Swap completed with': the value of what came in minus the value of what went out, both at fair value where each crate now sits.
   *   exit: one row when the sale settles, the proceeds that landed (the locked score's net worth). summary: see below.
   *   client: one row a day for the money the accounts paid that day (`n` accounts), one row per SLA penalty (negative); the closing row of a contract is a MEMO (amt 0, `earned` and `cac` in the row):
   *     the acquisition cost is booked once, at signing, and the income day by day.   overdraft: the day's interest on a negative balance (negative).   p2p 'Royalty paid': a day's payment on a stream you owe (negative).
   * The unused-commitment fee is a MEMO (amt 0, the fee in `fee`): it is added to the loan and leaves with the repayment, which is the row that holds it (counted here too it would be paid twice in the sum), and loan
   * interest likewise accrues to the loan and leaves with the `repay` row. So the rows that are NOT cash are the pitch gains, the pool sale (booked when it is made, cash lands after the delay) and the swap values;
   * every other cash movement has its row.
   * Size: at LEDGER_CAP rows the oldest LEDGER_FOLD are folded into ONE summary row at the head (their count, their total and a per-type breakdown, written out in its text and kept in `byType`), never silently
   * dropped; `s.ledgerDropped` counts the folded rows. The download therefore holds every row that is still a row, and one line for the rest.
   */
  led(type, text, amt = 0, meta = {}) {
    const L = this.s.ledger;
    L.push({ h: this.s.hour, type, text, amt: isNum(amt) ? amt + 0 : 0, ...meta }); // (+ 0: a row is recorded as 0 and never -0, which a number format would print as -$0.00)
    if (L.length > LEDGER_CAP) this._foldLedger();
  }
  /** Folds LEDGER_FOLD rows into the summary row. The bulk goes first and the evidence stays: a manager cycle with an ordinary creativity score, then any other manager cycle, then the oldest of the rest
   *  (the Debrief reads the low-Cm cycles, the costs a Background ran up, the swaps and the shock-time actions, so those are the last to be folded). */
  _foldLedger() {
    const s = this.s, L = s.ledger, head = L[0]?.type === 'summary' ? L.shift() : null;
    const rank = (r) => (r.type === 'pipe' ? (r.cm < 0.8 ? 1 : 0) : 2);
    const order = L.map((r, i) => i).sort((x, y) => rank(L[x]) - rank(L[y]) || x - y).slice(0, LEDGER_FOLD);
    const gone = new Set(order), cut = order.sort((x, y) => x - y).map((i) => L[i]);
    s.ledger = L.filter((r, i) => !gone.has(i));
    const sum = head || { h: cut[0]?.h ?? s.hour, type: 'summary', text: '', amt: 0, n: 0, from: cut[0]?.h ?? s.hour, upto: 0, byType: {} };
    sum.from ??= sum.h; // (a summary written before it said where it began)
    for (const r of cut) {
      sum.n++; sum.amt += isNum(r.amt) ? r.amt : 0; sum.upto = Math.max(sum.upto, r.h); sum.from = Math.min(sum.from, r.h);
      const t = (sum.byType[r.type] ||= { n: 0, amt: 0 });
      t.n++; t.amt += isNum(r.amt) ? r.amt : 0;
    }
    const by = Object.entries(sum.byType).sort((a, b) => Math.abs(b[1].amt) - Math.abs(a[1].amt)).slice(0, 6).map(([k, v]) => `${k} ${v.n} line${v.n === 1 ? '' : 's'}, ${v.amt < 0 ? '-' : '+'}${money(Math.abs(v.amt))}`).join('; ');
    sum.h = sum.from; // it stands where the oldest line it holds stood, and its text says how far it reaches
    sum.text = `${sum.n} older lines from day ${Math.floor(sum.from / 24) + 1} to day ${Math.floor(sum.upto / 24) + 1} folded into this one. By type: ${by}${Object.keys(sum.byType).length > 6 ? '; and others' : ''}.`;
    s.ledger.unshift(sum);
    s.ledgerDropped = sum.n;
  }
  xp(n) { this.s.xp += Math.round(clamp(fin(+n, 0), 0, XP_CALL) * this.P.xpMult); this._levelCheck(); }
  level() { return Math.floor(Math.sqrt(this.s.xp / LEVEL_XP)) + 1; }
  /** Each new level grants one skill point (spendPoint) while a skill can still use it; once all three are at mastery the level pays XP instead. */
  _levelCheck() {
    const s = this.s;
    s.xp = isNum(s.xp) ? clamp(s.xp, 0, XP_MAX) : 0; // a save or a caller that put NaN, a negative or an absurd figure here must not make the loop below spin
    if (this._lvlBusy) return; // a level's own XP (a mastered founder's point) is picked up by the loop below, in order, not by a second loop inside it
    this._lvlBusy = true;
    try {
      while (this.level() > s.lvlPaid) {
        const lv = ++s.lvlPaid;
        const g = this.grantPoints(1);
        this.note('good', g.points ? `Level ${lv}. You earned a skill point.` : `Level ${lv}. Every skill is at mastery, so the level pays ${g.xp} XP instead of a point.`, { level: lv });
        this.emit('level', { level: lv });
      }
    } finally { this._lvlBusy = false; }
  }
  /** Skill points the three skills can still use (what SKILL_MAX leaves, less the points already banked). */
  pointRoom() {
    const s = this.s;
    return Math.max(0, Object.values(s.skills).reduce((a, l) => a + Math.max(0, SKILL_MAX - l), 0) - s.points);
  }
  /** Quests, achievements, Academy missions and levels grant skill points through here. Points no skill can use any more are paid as XP (ECON.pointXp each) rather than banked as dead weight. */
  grantPoints(n) {
    const s = this.s;
    n = clamp(Math.floor(fin(+n, 0)), 0, POINTS_CALL);
    const points = Math.min(n, this.pointRoom()), spare = n - points, xp = Math.round(spare * ECON.pointXp);
    s.points += points;
    if (xp > 0) { s.xp += xp; this._levelCheck(); } // a spare point's XP is never multiplied again; a level it reaches pays like any other (and ends in XP too once skills are maxed)
    return { points, xp };
  }
  burnedOut() { return this.s.hour < this.s.ps.burnoutUntil; }
  /**
   * A fraction of profit is garnished while the Business-School Grad's student loans last. Returns what was taken.
   * Only money that is actually in hand can be taken: `avail` (default: the cash on hand) caps the take, and what the servicer was owed but could not collect
   * is carried in ps.garnishDue and collected from the next profit, so the cap is still repaid in full and cash never goes negative because of it.
   */
  garnish(profit, avail = this.s.cash) {
    const s = this.s, take = this._garnishTake(profit, avail);
    s.cash -= take;
    return take;
  }
  /** The bookkeeping half of garnish(): works out and records the take but leaves the money to the caller (a delayed settlement pays it out of the queued amount). */
  _garnishTake(profit, avail) {
    const g = this.P.garnish, s = this.s;
    if (!g || !(profit > 0) || s.ps.garnished >= g.cap) return 0;
    const owed = Math.min(g.cap - s.ps.garnished, (s.ps.garnishDue || 0) + profit * g.rate);
    const take = Math.min(owed, Math.max(0, fin(avail, 0)));
    s.ps.garnishDue = owed - take;
    if (take <= 0) return 0;
    s.ps.garnished += take;
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
  /** The player's own sales of one class in one district over the last 48 virtual hours (a pitch, a pool sale or a manager's cycle each count one), read from s.niche once per hour. */
  ownVolume(zone, cls) {
    const s = this.s, key = s.hour + ':' + s.niche.length;
    if (!this._ov || this._ov.key !== key || this._ov.s !== s) {
      const m = new Map(), from = s.hour - 48;
      for (const [h, z, c] of s.niche) if (h > from) { const k = z + '|' + c; m.set(k, (m.get(k) || 0) + 1); }
      this._ov = { key, s, m };
    }
    return this._ov.m.get(zone + '|' + cls) || 0;
  }
  /** Price pressure from everyone selling the same class in a district: the cohort's volume plus your own, so your selling narrows the gap you sold into (docs: arbitrage-at-scale). */
  crowd(cls, zone) {
    const c = this.env.cohort?.counts(this.s.hour, zone, cls);
    let m = 1 - 0.4 * Math.min(1, ((c ? c.total : 0) + this.ownVolume(zone, cls)) / 220);
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
  zoneTax(z) { const Z = Number.isInteger(z) ? ZONES[z] : null; return Z ? Z.tax * this.env.difficulty.friction : 0; } // a district id that is not one is a district with no tax, not a crash (ids are numbers: own() would refuse them all)
  liqDelay(zone) { return zone >= 13 ? 48 : zone >= 9 ? 24 : 0; } // governance drag grows with the stakes
  loanRate(prod) {
    if (prod === 'circle') return 0; // the Community Circle charges no interest
    const spread = LOANS[prod].spread * Math.max(0.2, 1 + (this.P.spreadAdj || 0)) * this.B.spreadMult;
    return (BASE_RATE + this.mods().rateBps / 10000 + spread) * Math.max(0.45, 1 - 0.07 * (this.lvl('fintech') - 1));
  }
  storeCap(zone) { return ZONES[zone].store + this.B.storeBonus; }
  debt() { return this.s.loans.reduce((a, l) => a + l.principal + l.accr, 0); }
  invValue() { return this.s.assets.reduce((a, x) => a + this.val(x), 0); }
  /** A truck's crates, valued at the LOWER of where they left and where they are going: an unlanded price gap is not wealth yet (it would lift net worth, the district gates and the debt limit for the hours of the trip). */
  inTransit(f) { return f.items.reduce((v, a) => v + Math.min(this.val(a), this.val(a, f.to)), 0); }

  /** What this founder still owes on the royalty streams they pay: the unpaid arrears, and every day of a stream still to come that the run can reach. A promise is a debt (the receiver is counting on it). */
  royaltyOwed() {
    const s = this.s;
    let v = 0;
    for (const r of s.royalties) {
      if (r.dir !== 'pay') continue;
      const owed = (r.arrears || 0) + r.perDay * Math.max(0, Math.floor(Math.min(r.until, TOTAL_HOURS) / 24) - Math.floor(s.hour / 24));
      v += r.cap == null ? owed : Math.min(owed, Math.max(0, r.cap - (r.paid || 0))); // (a stream pays no more than it was counted for, see finalizeOffer)
    }
    return v;
  }
  netWorth() {
    const s = this.s;
    let v = s.cash;
    for (const a of s.assets) v += this.val(a);
    for (const f of s.freight) v += this.inTransit(f);
    for (const e of s.escrow) { v += e.cash || 0; for (const a of e.assets) v += this.val(a); }
    for (const x of s.settle) v += x.amt;
    for (const p of s.pipes) v += p.basis + (p.inflight || 0);
    return v - this.debt() - this.royaltyOwed();
  }
  /** The net worth the score stands on: the one struck at the bell or at an exit once the run is closed (the live figure keeps drifting with the class's prices, and would sit beside a frozen score), else the live one. */
  closedNetWorth() { const s = this.s; return s.exit ? s.exit.nw : s.final ? s.final.nw : this.netWorth(); }
  deRatio() { const nw = this.netWorth(); return nw <= 0 ? (this.debt() > 0 ? Infinity : 0) : this.debt() / nw; }
  eei() {
    if (this.s.exit) return this.s.exit.eei;
    if (this.s.final) return this.s.final.eei; // the score is struck at the bell on day 90 and does not move again
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
  /** The clearing horizon. An exit that has not settled by now settles at the bell (the run must not end with its proceeds parked for ever); otherwise the score is struck here. */
  _finish() {
    const s = this.s;
    if (s.exiting) this._finishExit();
    else {
      const nw = this.netWorth();
      s.final = { nw, eei: eeiCalc(nw, s.startCapital, this.daysRemaining(), this.env.difficulty.eeiFloor), hour: s.hour };
      s.over = true;
    }
    this.note('info', 'Day 90. The clearing horizon has closed. Open the debrief to see your Economic Efficiency Index.', { final: true });
  }

  stepHour() {
    const s = this.s;
    if (s.over) return; // a closed run does not tick
    this._stepping = true;
    let done = false;
    try {
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
      if (s.exiting && s.hour >= s.exiting.at) this._finishExit(); // the score is locked here: nothing after it may touch the cash (no day tick, no tax, no audit)
      else {
        if (s.hour % 24 === 0) this._dayTick();
        if (!s.exiting) { this._audits(); this._marginCall(); } // a sold business has no audit to answer and no loan to call
      }
      const nw = this.netWorth();
      if (nw > s.peak) s.peak = nw;
      const was = s.insolvent;
      s.insolvent = nw <= 0 && !s.exit;
      if (s.insolvent && !was) this.emit('insolvent');
      done = true;
    } finally {
      this._stepping = false;
      if (!done) this._ckptDue = false;
    }
    if (this._ckptDue) { this._ckptDue = false; this._checkpoint(); }
    if (s.hour >= TOTAL_HOURS && !s.over) this._finish(); // every way of moving time forward closes the run at the bell, not only advanceTo
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
        this.note('warn', `${ev.name}: effective in ${hrs >= 24 ? plural(Math.round(hrs / 24), 'day') : plural(hrs, 'hour')}.`, { alert: { ...ev.alert, name: ev.name, level: ev.level, start: ev.start } });
      }
      if (!ev.started && h >= ev.start) {
        ev.started = true;
        if (!ev.warned) { ev.warned = true; ev.warnedAt = h; this.note('bad', `BREAKING: ${ev.name} is live now.`, { alert: { ...ev.alert, name: ev.name, level: ev.level, start: ev.start } }); }
        else this.note('bad', `${ev.name} is now in effect.`);
        this.emit('shock', { kind: ev.kind });
        s.shockLog.push({ id: ev.id, kind: ev.kind, name: ev.name, start: h, nw: this.netWorth(), cash: s.cash, debt: this.debt(), de: Math.min(this.deRatio(), DE_CAP), inv: this.invValue(), pipes: s.pipes.length, intl: s.pipes.filter((p) => p.channel === 'intl').length, pivot0: s.pivot, nwAfter: null, pivots: null, warnedHours: ev.start - (ev.warnedAt ?? ev.start) });
        this._m = null;
      }
      if (ev.kind === 'tiktok' && h === ev.start + 48) this.note('bad', 'Market fatigue: trend goods lose half their value for 72 hours.');
    }
    for (const sh of s.shockLog) if (sh.nwAfter == null && h >= sh.start + 120) { sh.nwAfter = this.netWorth(); sh.pivots = s.pivot - sh.pivot0; }
  }
  /** Instructor-injected or algorithmic shock. Idempotent on id. */
  injectEvent(kind, atHour, extra = {}) {
    // everything here may arrive over the network: a kind we know, a real hour, a text id and a known class, or the shock is refused before it touches the state
    if (!own(EVENTS, kind) && !own(ALGO_EVENTS, kind)) return false;
    if (!isNum(atHour)) return false;
    atHour = Math.max(0, Math.floor(atHour));
    extra = extra && typeof extra === 'object' ? extra : {};
    const id = typeof extra.id === 'string' && extra.id && extra.id.length <= 120 ? extra.id : `${kind}@${atHour}`;
    if (this.s.events.some((e) => e.id === id)) return false;
    if (extra.replace) this.s.events = this.s.events.filter((e) => !(e.kind === kind && !e.started));
    let inst;
    if (own(EVENTS, kind)) inst = this._evInstance(kind, atHour, { id, injected: !!extra.injected || !!extra.replace });
    else if (own(ALGO_EVENTS, kind)) {
      const made = ALGO_EVENTS[kind].mk(own(ASSETS, extra.cls) ? extra.cls : 'sneakers');
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
      const rate = mult / (Z.leadEvery * ECON.leadEvery); // buyers per hour; a fraction of an arrival accumulates until it is whole
      if (Math.floor(s.hour * rate) === Math.floor((s.hour - 1) * rate)) return;
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
        budget = fmv < 2 ? 3 + this.rand() * 12 : fmv * (1 + (0.4 + this.rand() * 2.2) * ECON.urgentK * (1 - ECON.urgentFade * clamp((z - 4) / 8, 0, 1)));
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
    // No fraud before the third trade: a founder with one paperclip and no cash cannot afford the check, and a first sale to a fraud would end the run at $0.
    const scam = !!this.P.scamRate && this.rand() < this.P.scamRate && s.trades >= 3;
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
    const lotRate = 1 / (Z.lotEvery * ECON.lotEvery * (1 - this.P.lotRefresh));
    if (byClock && Math.floor(s.hour * lotRate) === Math.floor((s.hour - 1) * lotRate)) return;
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
    // The district's headline rates are rates of LOTS, whatever the mix of classes on sale: a broken lot needs a class that can be repaired and a counterfeit needs a working
    // lot of a class that can be faked, so each roll is divided by the share of the draw that can take it. (A district that can't reach its rate, for want of such classes, falls short.)
    const repairable = classes.filter((c) => ASSETS[c].repair).length / classes.length, riskOf = (c) => ASSETS[c].fakeRisk ?? 1;
    const brokenLots = Math.min(repairable, Z.rules.repair ? 0.6 : 0.4 * repairable); // the Auto Row's 60% of lots; elsewhere 40% of the classes that can be repaired
    const cond = def.repair && this.rand() < Math.min(1, brokenLots / repairable) ? 'broken' : 'ok';
    const asset = { cls, cond, quality: 1, wear: 1 };
    const asIs = assetFMV(asset, z, this.mods(), this.crowd(cls, z));
    const ops = this.lvl('ops');
    let disc = lotShare(ops, cond); // market.js: a working lot gets cheaper with Ops, a wreck dearer
    if (cond === 'broken') disc *= (1 - this.P.brokenDiscount) * (1 + ECON.brokenTop * Math.max(0, z - ECON.brokenFrom)); // and the sellers of wrecks in the top districts know what a repaired crate fetches
    if (asIs < Z.scale * 0.6) disc *= 1 - (this.P.lotDiscount || 0); // small lots (the Side-Hustler)
    if (Z.rules.gray) disc *= 1 - (this.P.lotDiscountGray || 0); // gray markets (the Second-Chance Hustler)
    // What the seller does not say: the real condition, and whether it is genuine. Posted prices describe the lot "as described".
    const q = z <= 2 ? 0.85 + this.rand() * 0.3 : 0.7 + this.rand() * 0.45;
    const meanRisk = classes.reduce((a, c) => a + riskOf(c), 0) / classes.length;
    const fake = cond === 'ok' && this.rand() < Math.min(1, (Z.rules.fakes || 0) * riskOf(cls) / (meanRisk * (1 - brokenLots)));
    const labels = ['worn finish', 'loose fittings', 'faded markings', 'missing parts', 'failing seal', 'hairline cracks'];
    const defects = labels.filter((_, i) => i < Math.round((1 - q) * 8 + (fake ? 1 : 0))).map((label, i) => ({ id: 'd' + i, label }));
    const mode = Z.rules.auction && this.rand() < Z.rules.auction ? 'auction' : 'fixed';
    const id = 'T' + s.nid++;
    // The Second-Chance street sense is a strong signal, not a perfect one: it flags most counterfeits (never an honest lot) and misses a few, decided by the lot's own id so it never changes for a lot.
    const warn = this.P.fakeDetect && fake && hash01(s.seed + ':warn:' + id) >= ECON.warnMiss;
    s.lots[z].push({
      id, zone: z, cls, cond, price: Math.max(0.01, Math.round(asIs * disc * 100) / 100), exp: s.hour + 24 + Math.floor(this.rand() * 24), mode,
      truth: { q: Math.round(q * 100) / 100, fake, defects }, ...(warn ? { warn: true } : {}),
    });
  }
  /** Your own recent sales of a class in a district. `skip` leaves out the cycles of one pipeline (a niche row is [hour, zone, cls, buyer, pipelineId?]). */
  ownCounts(zone, cls, skip = null) {
    const out = { total: 0, byBuyer: {} }, from = this.s.hour - 48;
    for (const [h, z, c, b, pid] of this.s.niche) if (h > from && z === zone && c === cls && !(skip && pid === skip)) { out.total++; out.byBuyer[b] = (out.byBuyer[b] || 0) + 1; }
    return out;
  }
  /**
   * The Creativity Multiplier of a niche. Pass `skip` (a pipeline's id) to see it as that pipeline does: its own cycles are not part of the crowd it sells into. A manager that
   * has the lane to itself is not "a herd of one" (alone, S would read 1 and Cm would sit on its 0.40 floor from the second cycle on); the crowd is the class, you by hand and your other managers.
   */
  cmFor(zone, cls, seg, skip = null) {
    const c = this.env.cohort?.counts(this.s.hour, zone, cls) || { total: 0, byBuyer: {} };
    const own = this.ownCounts(zone, cls, skip);
    const vT = c.total + own.total, vN = (c.byBuyer[seg] || 0) + (own.byBuyer[seg] || 0);
    const cm = creativity(vN, vT);
    return { cm, S: saturation(vN, vT), vN, vT, band: creativityBand(cm), key: nicheKey(zone, cls, seg) };
  }
  logNiche(zone, cls, seg, cm, pid = null) {
    this.s.niche.push(pid ? [this.s.hour, zone, cls, seg, pid] : [this.s.hour, zone, cls, seg]);
    if (seg !== 'npc-pool') { this.s.cm.sum += cm; this.s.cm.n++; }
  }
  /** Every underserved niche in a zone, best first (the Market Research "Niche Radar"). */
  radar(zone, limit = 6, skip = null) {
    const rows = [];
    for (const cls of Object.keys(ASSETS)) {
      if (demandOf(ASSETS[cls], zone) <= 0) continue;
      for (const seg of Object.keys(BUYERS)) {
        if (BUYERS[seg].zone !== zone) continue;
        const fit = fitOf(cls, seg);
        if (fit < 0.5) continue;
        const c = this.cmFor(zone, cls, seg, skip);
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
  /**
   * deal = { mult } from the Deal Room (pitch angle x haggle result). Clamped here, so no game can break the economy.
   * A quote is BLIND unless `opts.blind === false`: what the player may be shown, as described, with no peek at a crate's hidden truth or at a buyer's undisclosed fraud.
   * Only pitch() asks for the real thing (the buyer checks what you sell).
   */
  quotePitch(assetId, leadId, deal, opts = {}) {
    const s = this.s, a = s.assets.find((x) => x.id === assetId);
    if (!a) return fail('Pick an asset from your inventory.');
    let lead = null;
    for (const z of s.zones) lead = lead || (s.leads[z] || []).find((l) => l.id === leadId);
    if (!lead) return fail('That buyer has left.');
    if (a.zone !== lead.zone) return fail(`Your ${ASSETS[a.cls].name} is in ${ZONES[a.zone].short}. Freight it to ${ZONES[lead.zone].short} first.`);
    const def = ASSETS[a.cls], z = lead.zone;
    if (demandOf(def, z) <= 0) return fail(`Nobody in ${ZONES[z].short} wants ${def.name}.`);
    if (lead.scam && lead.verified) return fail('You verified this buyer: it is a fraud. Do not ship to them.');
    if (a.cond === 'broken' && !this.acceptsBroken(lead.seg)) return fail('This buyer will not take a broken asset. Repair it first, or sell to someone who works with scrap and spares.');
    let fit = fitOf(a.cls, lead.seg);
    if (lead.need) fit = def.tags.includes(lead.need) ? 1 : fit * 0.5;
    const ci = this.cmFor(z, a.cls, lead.seg);
    const fmv = this.val(a);
    const B = BUYERS[lead.seg];
    const blind = opts?.blind !== false;
    const seen = !blind || !!a.known;
    const counterfeit = seen && !!a.truth?.fake;
    const qual = seen && a.truth && !a.truth.fake ? a.truth.q : 1;
    const ref = lead.need ? lead.budget : fmv * (a.known ? 1 : qual);
    const term = lead.need ? 0.55 + 0.45 * fit : fitMult(fit);
    const hustle = this.P.pitchMult;
    const dealMult = clamp(fin(deal?.mult, 1), 0.6, 1.4);
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
      ok: true, rejected, reason: counterfeit ? 'counterfeit' : fit < 0.15 ? 'nofit' : null, scam: !blind && !!lead.scam && !lead.verified, fit, fmv, ci, price, capped, tax, fee, net, goods, change, received,
      lead: blind ? this._publicLead(lead) : lead, asset: a, zone: z, mods: this.mods(), deal: dealMult,
      gain: fmv > 0 ? received / fmv - 1 : 0, profit: received - (a.basis || 0), parts: { ref, term, base: CM.pitchBase, cm: ci.cm, growth: this.growthMult(), hustle, deal: dealMult, quality: qual },
    };
  }
  /** A buyer as the player may see them: the fraud flag shows only once the buyer has been verified. */
  _publicLead(lead) {
    if (!lead.scam || lead.verified) return lead;
    const { scam, ...rest } = lead;
    return rest;
  }
  pitch(assetId, leadId, deal) {
    const q = this.quotePitch(assetId, leadId, deal, { blind: false });
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
    this.garnish(q.profit); // capped at the cash on hand: goods taken in kind are not money yet
    const win = q.received > q.fmv * 1.02;
    s.streak = win ? s.streak + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (win) { s.rep = clamp(s.rep + 1, 0, 100); s.loyal[q.lead.seg] = (s.loyal[q.lead.seg] || 0) + 1; } else if (this.P.flopRep) { s.rep = clamp(s.rep - this.P.flopRep / 2, 0, 100); s.ps.goodwillUntil = s.hour + 48; }
    const xp = win ? 40 + 60 * clamp(Math.log10(1 + q.gain), 0, 3) + Math.min(s.streak, 10) * 5 : 5; // a long streak keeps its glory, not an endless XP spigot
    this.xp(xp);
    this.led('pitch', `${ASSETS[a.cls].name} to ${BUYERS[q.lead.seg].name}${got ? ' for ' + got : ''}`, q.received - q.fmv, { z, cm: q.ci.cm, S: q.ci.S, vN: q.ci.vN, vT: q.ci.vT, cls: a.cls, seg: q.lead.seg, fmv: q.fmv, recv: q.received });
    // 'pioneer' is a win in a rare niche: a capped or weak-fit sale there that did not clear fair value is not a pioneer win, so it is only 'flat'. 'herd' is a SALE made in the crowded band, whatever it paid:
    // the herd's lesson is most of all for the sale that lost money in it (the Deal Room's "Sold into the herd" and the Follow the Leader achievement read this label).
    const band = q.ci.band.id, outcome = band === 'herd' ? 'herd' : !win ? 'flat' : band === 'pioneer' ? 'pioneer' : 'win';
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
    let cost = Math.max(0.01, Math.round(lead.budget * 0.01 * 100) / 100);
    // A founder down to the last crate with nothing to pay for the check is vouched for: a fraud taking that crate would leave $0, nothing to sell and no way back.
    if (s.cash < cost && s.assets.length <= 1 && !s.pipes.length) cost = 0;
    if (s.cash < cost) return fail(`Verification costs ${money(cost)}.`);
    s.cash -= cost; lead.verified = true;
    this.led('verify', 'Checked a buyer\'s credentials', cost ? -cost : 0);
    return ok(lead.scam ? 'Fraud confirmed. Skip this buyer.' : 'Verified: this buyer is genuine.', { scam: !!lead.scam, cost });
  }
  /** What the Deal Room needs to simulate a lot: the lot's hidden truth. Evidence from Inspect is noisy, so this is not a leak. */
  lotTruth(zone, lotId) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    return lot ? { ...lot.truth, defects: lot.truth.defects.map((d) => ({ ...d })) } : null;
  }
  /**
   * Skill games pay XP, count in the debrief and tell the quests once per thing played, not once per run: `key` names it (the Deal Room passes the lot or the lead id; a
   * Read is keyed by its lot). A repeat of the same key is allowed and pays nothing. A run with no key (a test, an older caller) is paid every time.
   */
  _firstPlay(kind, key) {
    if (key == null) return true;
    const paid = (this.s.paid ||= {}), k = kind + ':' + key;
    if (own(paid, k)) return false;
    paid[k] = 1;
    return true;
  }
  /** Experience for a skill game, at most SKILL_XP_DAY of one kind in a virtual day. The play is still tallied and still tells the quests; only the experience it pays is capped, so reading
   *  every lot in every district is practice and not a faster way up. Returns what was paid (before the Background's multiplier). */
  _skillXp(kind, amount) {
    const day = this.day, m = (this.s.skillXp ||= { day, paid: {} });
    if (m.day !== day || !m.paid || typeof m.paid !== 'object') { m.day = day; m.paid = {}; }
    const paid = m.paid[kind] || 0, pay = Math.max(0, Math.min(fin(+amount, 0), SKILL_XP_DAY - paid));
    m.paid[kind] = paid + pay;
    if (pay > 0) this.xp(pay);
    return pay;
  }
  /** The Deal Room's Read stage reports what the player learned; the lot (and the crate it becomes) remembers the belief. */
  recordInspect(zone, lotId, res) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot || !res?.estimate) return fail('That lot is gone.');
    lot.belief = { quality: clamp(fin(res.estimate.quality, 1), 0.6, 1.2), fakeProb: clamp(fin(res.estimate.fakeProb, 0.2), 0, 1), confidence: clamp(fin(res.confidence, 0), 0, 1) };
    const caught = lot.truth.fake && res.estimate.fakeProb >= 0.6;
    // A Read in which no probe was bought learned nothing: it pays nothing and does not use up the lot's one payment (a real read of the same lot later still pays).
    if (res.spent !== undefined && !(fin(+res.spent, 0) > 0)) return ok('Recorded.', { caught, repeat: true });
    if (!this._firstPlay('inspect', res.key ?? lotId)) {
      // A later visit that newly catches a counterfeit is still a counterfeit caught (the quests and achievements that count them), once per lot, with no experience and no score (it is not another inspection to grade).
      if (caught && !lot.caughtReported) { lot.caughtReported = true; this.emit('inspect', { fake: true, caught: true, repeat: true }); }
      return ok('Recorded.', { caught, repeat: true });
    }
    if (caught) lot.caughtReported = true;
    const score = clamp(fin(res.score, 0.5), 0, 1); // a number from outside is a number or the neutral default: a string once made the XP, and the debrief's tally, NaN
    this._skillXp('inspect', 8 + 22 * score);
    this._tally('inspect', score, !!res.quick);
    this.emit('inspect', { score, fake: lot.truth.fake, caught });
    return ok('Recorded.', { caught });
  }
  /** Per-game play counts for the debrief and the instructor: s.meta[kind] = { n, sum } (sum of scores), plus how many deals were played by hand and how many were Quick. */
  _tally(kind, score, quick) {
    if (!SKILL_GAMES.includes(kind)) return; // s.meta is indexed by it: a name like '__proto__' must never reach the lookup
    const m = (this.s.meta ||= {});
    const t = (m[kind] ||= { n: 0, sum: 0 });
    t.n++; t.sum += score;
    if (quick) m.quick = (m.quick || 0) + 1; else m.played = (m.played || 0) + 1;
  }
  /** A skill game played for its own sake (haggle, auction, repair) pays a little XP for good play. */
  recordPlay(kind, res) {
    if (!SKILL_GAMES.includes(kind)) return;
    res = res && typeof res === 'object' ? res : {};
    if (!this._firstPlay(kind, res.key)) return;
    const score = clamp(fin(res.score, 0.5), 0, 1);
    this._skillXp(kind, 6 + 24 * score);
    this._tally(kind, score, !!res.quick);
    if (kind === 'haggle') this.emit('haggle', { role: res.role === 'buy' ? 'buy' : 'sell', mult: fin(res.mult, 1), score, deal: !!res.deal });
    if (kind === 'auction') this.emit('auction', { won: !!res.won, price: fin(res.price, 0), surplus: fin(res.surplus, 0) });
  }
  /** deal = { mult } (a Haggle or Auction result as a share of the posted price), clamped to 0.6..1.4. */
  buyQuote(zone, lotId, deal) {
    const lot = this.s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot) return fail('That lot is gone.');
    const mult = clamp(fin(deal?.mult, 1), 0.6, 1.4);
    return ok('', { lot, mult, price: Math.max(0.01, Math.round(lot.price * mult * 100) / 100) });
  }
  /** A buyer who walked away, or whom the player walked away from, leaves the district. */
  passLead(zone, leadId, why = '') {
    const s = this.s, l = (s.leads[zone] || []).find((x) => x.id === leadId);
    if (!l) return fail('That buyer has left.');
    s.leads[zone] = s.leads[zone].filter((x) => x.id !== leadId);
    if (typeof why === 'string' && why) this.note('info', why.slice(0, 200));
    return ok('Buyer gone.');
  }
  /** A lot the player lost at auction goes to another bidder. */
  passLot(zone, lotId, why = '') {
    const s = this.s, lot = s.lots[zone]?.find((l) => l.id === lotId);
    if (!lot) return fail('That lot is gone.');
    s.lots[zone] = s.lots[zone].filter((l) => l.id !== lotId);
    if (typeof why === 'string' && why) this.note('info', why.slice(0, 200));
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
    const cost = repairCostFor(def.repair, ops, this.repairMultFor(a.zone)) * clamp(fin(deal?.costMult, 1), 0.9, 1.3);
    const q = clamp(restoreQuality(ops) * clamp(fin(deal?.qualityMult, 1), 0.85, 1.15), 0.3, 1.15);
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
    this.emit('repair', { cls: q.asset.cls, cost: q.cost, quality: q.quality, precision: clamp(fin(deal?.precision, 0.5), 0, 1) });
    return ok('Repaired.', q);
  }
  /** The district where digital goods fetch most when routed (the Digital Native's remote sale). */
  bestZone(items) {
    let best = null, bv = -1;
    for (const z of this.s.zones) { const v = items.reduce((x, a) => x + this.val(a, z), 0); if (v > bv) { bv = v; best = z; } }
    return best;
  }
  /** Blind unless `opts.blind === false` (as quotePitch): a crate nobody has checked is valued as described. sellPool is the one caller that gets the truth, because the pool checks what it buys. */
  poolQuote(ids, route = false, opts = {}) {
    const s = this.s, items = ids.map((id) => s.assets.find((a) => a.id === id)).filter(Boolean), blind = opts?.blind !== false;
    if (!items.length) return fail('Select assets to sell.');
    if (route && (s.zones.length < 2 || items.some((a) => !ASSETS[a.cls].tags.includes('digital')))) return fail('Digital routing needs a second district and digital assets.');
    const zone = route ? this.bestZone(items) : items[0].zone;
    if (!route && items.some((a) => a.zone !== zone)) return fail('Sell assets from one district at a time.');
    const fric = route ? FEES.digitalRouting : ZONES[zone].friction + this.instFee('pool');
    const per = items.map((a) => ({ a, value: this.val(a, zone) * (1 - fric) * (a.known || blind ? 1 : truthMult(a)) }));
    const total = per.reduce((x, y) => x + y.value, 0);
    return ok('', { per, total, zone, delay: route ? 48 : this.liqDelay(zone), room: s.pool[zone], fric, route });
  }
  sellPool(ids, route = false) {
    const q = this.poolQuote(ids, route, { blind: false });
    if (!q.ok) return q;
    const s = this.s;
    if (q.total > s.pool[q.zone]) return fail(`The ${ZONES[q.zone].short} liquidity pool only has ${money(s.pool[q.zone])} left. It refills 35% a day.`, this.poolQuote(ids, route)); // the failure shows the blind quote, not the truth
    s.pool[q.zone] -= q.total;
    s.assets = s.assets.filter((a) => !ids.includes(a.id));
    for (const { a } of q.per) { this.logNiche(q.zone, a.cls, 'npc-pool', CM.ref); }
    const profit = q.total - q.per.reduce((x, y) => x + (y.a.basis || 0), 0);
    if (q.delay) s.settle.push({ amt: q.total - this._garnishTake(profit, q.total), at: s.hour + q.delay, note: 'Liquidation settlement' }); // the garnishment comes out of the proceeds when they land
    else { s.cash += q.total; this.garnish(profit); }
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
    const s = this.s;
    if (!Array.isArray(ids)) return fail('Select assets to ship.');
    const items = uniq(ids).map((id) => s.assets.find((a) => a.id === id)).filter(Boolean);
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
    const room = this.roomIn(to); // held, on a truck, in escrow and promised to an open swap all take a place
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
    const going = new Set(q.items.map((a) => a.id));
    s.assets = s.assets.filter((a) => !going.has(a.id));
    s.freight.push({ id: 'F' + s.nid++, items: q.items, to, sent: s.hour, arrive: s.hour + q.hours, risk: q.risk, book: q.book, from: q.from });
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
          this.led('customs', `Customs inspected freight bound for ${ZONES[f.to].short}`, fee ? -fee : 0, { z: f.to }); // (never -0: a broke founder's freight is inspected for nothing)
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
    // a crate on a truck ages with the rest of the stock: spoilage and depreciation are paid at midnight whether it is on a shelf or on the road (_dayTick ages s.assets only)
    if (s.hour % 24 === 0) for (const f of s.freight) for (const a of f.items) this._age(a, f.to);
  }
  /** One midnight of wear on a crate: depreciation, and spoilage for a perishable. THE one source for a shelf (_dayTick) and a truck (_freight): Just-In-Time stock decays half as fast on either, and a crate on the
   *  road is aged by the rule of the district it is heading for (the fads of the Tech Corridor double a digital good's wear there; a crate that has left it is not under that rule any more). */
  _age(a, zone = a.zone) {
    const d = ASSETS[a.cls], Z = ZONES[zone], jit = this.s.upg.jit ? 0.5 : 1;
    let decay = d.dep * 0.002 * jit;
    if (Z.rules.fads && d.tags.includes('digital')) decay *= 2; // fads: digital goods lose value twice as fast
    a.wear *= 1 - decay;
    if (d.perish) a.wear *= 1 - 0.8 / d.perish * jit; // perishables spoil (just-in-time stock spoils half as fast)
  }
  /** Spend a skill point (earned by levelling up). Cash training is gone: skill is earned by play. */
  spendPoint(skill) {
    const s = this.s, l = own(s.skills, skill) ? s.skills[skill] : null;
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
    const ci = p.cls && p.buyer ? this.cmFor(z, p.cls, p.buyer, p.id) : { cm: CM.ref, S: 0, vN: 0, vT: 0, band: creativityBand(CM.ref) };
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
    if (!own(PIPE, kind)) return fail('Unknown manager.');
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
    p.alloc = clamp(isNum(cfg.alloc) ? cfg.alloc : this.pipeCap(p), 0, this.pipeCap(p)); // a negative, NaN or text allocation is the cap, not a manager that pays you to run
    const plot = s.pipes.filter((x) => x.zone === zone).length; // which plot of the district this one fills
    s.pipes.push(p);
    if (this._firstPlay('hire', `${kind}@${zone}#${plot}`)) this.xp(120); // paid once for each manager in each plot: hiring and releasing the same one again is a cash loss, not a way to buy levels
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
    s.cash -= c; p.level++; p.basis += c;
    if (this._firstPlay('upgrade', `${p.kind}@${p.zone}#${s.pipes.filter((x) => x.zone === p.zone).indexOf(p)}@${p.level}`)) this.xp(80); // once for each level of each plot
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
    const s = this.s, U = own(UPGRADES, id) ? UPGRADES[id] : null;
    if (!U) return fail('Unknown upgrade.');
    if (s.upg[id]) return fail('Already installed.');
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
    this.logNiche(p.zone, p.cls, p.buyer, f.ci.cm, p.id);
    this.led('pipe', `${PIPE[p.kind].name}: ${ASSETS[p.cls].name} to ${BUYERS[p.buyer].name}`, f.net, { z: p.zone, cm: f.ci.cm, pid: p.id });
    this.xp(Math.max(1, Math.log10(Math.abs(f.net) + 1) * 4));
  }

  // ------------------------------------------------------------------ clients (CAC vs LTV)
  /** A contract is paid at the daily ticks: the first one after signing, then C.days in all. `until` is the hour just after its last payment (so a contract signed any time of day pays exactly C.days
   *  days and frees its slot the hour after the last one), and `payDays` how many of those payments the run still has room for. */
  _contract(C) {
    const first = (Math.floor(this.s.hour / 24) + 1) * 24;
    return { until: first + (C.days - 1) * 24 + 1, payDays: Math.max(0, Math.min(C.days, Math.floor((TOTAL_HOURS - first) / 24) + 1)) };
  }
  /** `days` is the contract's length; `payDays` how many of those days it can pay before day 90 (the run cuts a contract off with no refund), and the LTV, ratio and payback are the ones that count. */
  clientQuote(tier) {
    const s = this.s, C = own(CLIENTS, tier) ? CLIENTS[tier] : null;
    if (!C) return fail('Unknown account type.');
    const cac = C.cac * Math.max(0.5, 1 - 0.08 * (this.lvl('growth') - 1)) * (s.upg.seo ? 0.85 : 1);
    const day = C.perDay * (1 - this.zoneTax(C.zone)), payDays = this._contract(C).payDays, ltv = day * payDays, payback = cac / day;
    return { cac, ltv, ratio: ltv / cac, payback, perDay: C.perDay, days: C.days, payDays, worthwhile: payback < payDays };
  }
  acquireClient(tier, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    const s = this.s, C = own(CLIENTS, tier) ? CLIENTS[tier] : null;
    if (!C) return fail('Unknown account type.');
    if (!s.zones.includes(C.zone)) return fail('Not available in your districts yet.');
    if (C.needs && !s.mil[C.needs]) return fail(`Unlocks at Milestone ${C.needs.slice(1)}.`);
    if (this.liveClients(tier).length >= C.max) return fail('You already hold the maximum of these accounts.');
    if (s.pipes.length < C.minRunning) return fail(`This account's SLA needs ${C.minRunning} pipeline${C.minRunning > 1 ? 's' : ''} running. Build the capacity first, then sign the client.`);
    const q = this.clientQuote(tier);
    if (!q.worthwhile && !opts.force) return fail(`This contract could not earn back its ${money(q.cac)} before day 90: ${q.payDays} paying day${q.payDays === 1 ? '' : 's'} are left and it needs ${Math.ceil(q.payback)}.`, q);
    if (s.cash < q.cac) return fail(`Acquisition costs ${money(q.cac)}.`);
    s.cash -= q.cac;
    s.clients.push({ id: 'C' + s.nid++, tier, cac: q.cac, until: this._contract(C).until, earned: 0, breaches: 0 });
    this.xp(90);
    this.led('client', `Signed a ${C.name}`, -q.cac);
    this.emit('client', { tier });
    return ok('Account signed.', q);
  }
  /** The accounts that still pay: a contract past its last payment stays in `s.clients` until the next midnight closes it, and counts for nothing meanwhile (the slot is free the hour after the last payment). `tier`: only that kind. */
  liveClients(tier) { const s = this.s; return s.clients.filter((c) => (tier == null || c.tier === tier) && !c.done && s.hour < c.until); }
  runningPipes() { return this.s.pipes.filter((p) => p.status === 'running').length; }

  // ------------------------------------------------------------------ bank
  loanRoom(prod) {
    if (!own(LOANS, prod)) return { limit: 0, owed: 0, room: 0, de: 0 };
    const s = this.s, L = LOANS[prod], mult = this.B.creditLimitMult;
    const owed = s.loans.filter((l) => l.prod === prod).reduce((a, l) => a + l.principal + l.accr, 0);
    let lim;
    if (prod === 'pipeline') lim = L.limitPct * (this.invValue() + s.pipes.reduce((a, p) => a + p.basis, 0));
    else if (prod === 'circle') lim = (this.P.circle?.pct || 0) * Math.max(0, this.netWorth()); // borrowing leaves net worth as it was (cash and debt rise together), so the cap is a share of that
    else lim = L.limit * mult;
    const de = Math.max(0, DEBT.maxDE * this.netWorth() - this.debt());
    return { limit: lim, owed, room: Math.max(0, Math.min(lim - owed, de)), de };
  }
  loanBlock(prod) {
    const s = this.s;
    if (!own(LOANS, prod)) return 'Unknown loan product.';
    if (prod === 'circle') return this.P.circle ? '' : 'You are not part of a Community Circle.';
    if (!s.mil.m1) return 'The Commercial Bank opens at Metro Hub ($1,000 net worth).';
    if (this.P.bankMinNW > 0 && this.netWorth() < this.P.bankMinNW) return `No bank will lend to you yet: your record asks for ${money(this.P.bankMinNW)} net worth first.`;
    if (this.mods().freeze) return 'Credit Action Override: no new loans until the freeze lifts.';
    if (LOANS[prod].zone && !s.zones.includes(LOANS[prod].zone)) return 'Needs Corporate Valley.';
    if (s.insolvent) return 'Your account is insolvent.';
    return '';
  }
  draw(prod, amount) {
    const s = this.s, L = own(LOANS, prod) ? LOANS[prod] : null;
    if (!L) return fail('Unknown loan product.');
    const block = this.loanBlock(prod);
    if (block) return fail(block);
    const r = this.loanRoom(prod);
    amount = Math.min(+amount || 0, r.room);
    if (!(amount >= 0.01)) { // less than a cent is no loan (and would only add an empty record); the reason is the limit that binds
      return fail(r.limit - r.owed <= 0.01 ? `The ${L.name} is fully drawn (limit ${money(r.limit)}).` : 'Nothing available to draw. Your debt-to-equity ratio caps borrowing at 3.0.');
    }
    const fee = amount * L.fee;
    s.cash += amount - fee;
    if (prod === 'enterprise' && !s.loans.some((l) => l.prod === 'enterprise')) s.entFeeNext = s.hour + L.every; // the facility's monthly fee starts with its first draw
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
    for (const a of s.assets) this._age(a);
    for (const e of s.escrow) for (const a of e.assets) this._age(a); // a crate parked in an open swap spoils like one on a shelf or a truck: an offer to a classmate who never answers (up to 72 hours) must not be a freezer
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
    // clients: the day's income is one row, each SLA penalty its own; a contract's closing row is a memo (its CAC was booked at signing, its income day by day)
    let clientIn = 0, clientN = 0;
    for (const c of s.clients) {
      const C = CLIENTS[c.tier];
      if (s.hour >= c.until) { c.done = true; continue; }
      if (this.runningPipes() >= C.minRunning || C.minRunning === 0) {
        const rev = C.perDay * (1 - this.zoneTax(C.zone));
        s.cash += rev; c.earned += rev; dayProfit += rev; clientIn += rev; clientN++;
      } else {
        const pen = C.perDay * 2;
        s.cash -= pen; c.breaches++; dayProfit -= pen;
        this.led('client', `SLA breach on a ${C.name}: penalty`, -pen, { sla: true });
        this.note('bad', `SLA breach on a ${C.name}: ${money(pen)} penalty. Keep ${C.minRunning} pipeline(s) running.`);
        if (c.breaches >= 2) { c.done = true; this.note('bad', `The ${C.name} walked away after repeated SLA breaches.`); }
      }
    }
    if (clientIn > 0) this.led('client', `Client accounts paid for the day (${clientN})`, clientIn, { n: clientN });
    for (const c of s.clients.filter((c) => c.done)) this.led('client', `${CLIENTS[c.tier].name} contract ended: earned ${money(c.earned)} on ${money(c.cac)} CAC`, 0, { earned: c.earned, cac: c.cac, memo: true });
    s.clients = s.clients.filter((c) => !c.done);
    // loans accrue daily, compound on schedule
    for (const l of s.loans) {
      const r = this.loanRate(l.prod);
      l.accr += l.principal * r / 30;
      dayProfit -= l.principal * r / 30;
      if (s.hour >= l.next) { l.principal += l.accr; l.accr = 0; l.next = s.hour + LOANS[l.prod].every; }
    }
    // The Enterprise Revolving Credit's commitment fee belongs to the facility, not to a draw: once a month, 1.5% of what is still undrawn of the whole line, however many draws it was taken in.
    const ent = s.loans.filter((l) => l.prod === 'enterprise');
    if (ent.length && s.entOpened) {
      s.entFeeNext ??= Math.min(...ent.map((l) => l.next)); // a save from before the facility had its own schedule
      if (s.hour >= s.entFeeNext) {
        s.entFeeNext = s.hour + LOANS.enterprise.every;
        const drawn = ent.reduce((a, l) => a + l.principal + l.accr, 0);
        const fee = Math.max(0, LOANS.enterprise.limit * this.B.creditLimitMult - drawn) * LOANS.enterprise.commit;
        if (fee > 0) { ent[0].principal += fee; this.led('loan', 'Unused-commitment fee', 0, { fee, memo: true }); } // no cash moves: the fee is added to the loan and leaves with the repayment, which is the row that holds it
      }
    }
    if (s.cash < 0) { const od = -s.cash * 0.005; s.cash -= od; s.overdraft += od; this.led('overdraft', 'Overdraft interest', -od); if (day % 3 === 0) this.note('bad', `Cash is negative (${money(s.cash)}). Overdraft interest is accruing.`); }
    // p2p royalty streams you pay. The day's rate falls due and is paid from the cash there is; what cash cannot cover stays owed (`arrears`, a liability in netWorth() and in an exit's proceeds) and is paid first
    // from the next cash, a message of at most a day's rate at a time (the receiver takes no more than that at once). A stream whose receiver's run is over (the room says so) is ended: nothing could be received.
    for (const r of s.royalties) {
      if (r.dir !== 'pay') continue;
      const left = r.cap == null ? Infinity : Math.max(0, r.cap - (r.paid || 0)); // what the stream may still pay in all
      if (s.hour <= r.until) r.arrears = Math.min((r.arrears || 0) + r.perDay, left);
      if (this.env.peerClosed?.(r.peer)) { if (r.arrears > 0) this.note('info', `A royalty stream you owed ended: the founder it was owed to has finished their run or is selling their business.`); r.arrears = 0; r.until = -1; continue; }
      let pay = Math.min(r.arrears || 0, Math.max(0, s.cash), r.perDay * ROYALTY_MSGS); // a dozen messages a day at most: a long arrears is paid down over several days, not in one burst the relay's rate limit would drop (and the money with it)
      if (pay < 0.005) continue;
      s.cash -= pay; r.arrears -= pay; r.paid = (r.paid || 0) + pay;
      this.led('p2p', 'Royalty paid', -pay, { offer: r.offer, peer: r.peer });
      while (pay >= 0.005) { const part = Math.min(pay, r.perDay); this.out.push({ t: 'royalty', to: r.peer, amount: part, offer: r.offer }); pay -= part; }
    }
    s.royalties = s.royalties.filter((r) => r.dir !== 'pay' || s.hour <= r.until || (r.arrears || 0) >= 0.005);
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
    this.led('audit', ignored ? 'Ignored audit: automatic penalty' : 'Failed audit: fine and velocity penalty', fine ? -fine : 0); // (the Heir's family lawyer waives the first fine: 0, not -0)
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
    if (kind === 'sale') kind = 'trade'; // the Bank drawer says "sale"
    if (kind !== 'ipo' && kind !== 'trade') return fail('Choose a trade sale or an IPO.');
    if (!s.mil.m3) return fail('Exit options unlock at Corporate Valley ($250,000 net worth).');
    if (kind === 'ipo' && s.auditFail > 0) return fail('IPO preparation needs a clean compliance record. Choose a trade sale.');
    const avg = s.dp.length ? s.dp.reduce((a, b) => a + b, 0) / s.dp.length : 0;
    const mult = (kind === 'ipo' ? 10 : 6) * this.B.exitMult;
    const premium = Math.max(0, avg) * mult * Math.max(0.3, 1 - 0.15 * s.auditFail);
    // what an open swap holds in escrow comes back to the founder first (exit() withdraws the offers), so it is part of the sale
    const held = s.escrow.reduce((a, e) => a + e.assets.reduce((x, i) => x + this.val(i), 0), 0);
    const hard = this.invValue() + held + s.pipes.reduce((a, p) => a + p.basis + (p.inflight || 0), 0) + s.freight.reduce((a, f) => a + this.inTransit(f), 0);
    const brokerage = (hard + premium) * FEES.exitBrokerage;
    const cash = s.cash + s.escrow.reduce((a, e) => a + (e.cash || 0), 0);
    const proceeds = cash + hard + premium - brokerage - this.debt() - this.royaltyOwed() + s.settle.reduce((a, x) => a + x.amt, 0);
    return ok('', { avg, premium, hard, brokerage, proceeds, hours: 48, daysLeft: Math.max(0, this.daysRemaining() - 2), eeiIfNow: eeiCalc(proceeds, s.startCapital, Math.max(0, this.daysRemaining() - 2), this.env.difficulty.eeiFloor) });
  }
  exit(kind) {
    if (kind === 'sale') kind = 'trade';
    const pre = this.exitQuote(kind);
    if (!pre.ok) return pre; // refused before anything is touched
    const s = this.s;
    if (s.escrow.some((e) => e.lockedBy && !e.lockLapsed)) return fail('A classmate is taking one of your swaps this very moment. Give it a few seconds, then sell.');
    // the swaps still waiting are withdrawn first, so their escrow is part of the sale and no classmate is left holding a stale offer
    for (const e of [...s.escrow]) { this.cancelOffer(e.offerId, 'Withdrawn: you are selling the business.'); this.out.push({ t: 'withdraw', offer: e.offerId, to: e.offer.to }); }
    const q = this.exitQuote(kind);
    s.exiting = { kind, at: s.hour + 48, proceeds: q.proceeds };
    s.assets = []; s.pipes = []; s.freight = []; s.clients = []; s.loans = []; s.settle = []; s.cash = 0;
    s.royalties = s.royalties.filter((r) => r.dir !== 'pay'); // what the sale owed on them was taken out of its proceeds (exitQuote)
    s.settle.push({ amt: q.proceeds, at: s.hour + 48, note: 'Exit' });
    this.led('exit', `Began a ${kind === 'ipo' ? 'IPO' : 'trade sale'}: ${money(q.proceeds)} settles in 48 virtual hours`, 0, { proceeds: q.proceeds });
    this.emit('exit', { kind });
    this.note('good', `${kind === 'ipo' ? 'IPO' : 'Trade sale'} launched. Governance drag: it settles in 48 virtual hours.`);
    return ok('Exit under way.', q);
  }
  _finishExit() {
    const s = this.s, proceeds = s.exiting.proceeds;
    s.cash += s.settle.reduce((a, x) => a + x.amt, 0); s.settle = []; // (at the bell an exit still settling lands here; otherwise _settlements has landed it already)
    const nw = this.netWorth(); // cash less any debt, and whatever else the founder still holds: the score is what is really left
    s.exit = { kind: s.exiting.kind, hour: s.hour, nw, daysLeft: this.daysRemaining(), eei: eeiCalc(nw, s.startCapital, this.daysRemaining(), this.env.difficulty.eeiFloor) };
    s.exiting = null; s.over = true;
    this.led('exit', 'Exit completed', proceeds);
    this.note('good', `Exit complete at ${money(nw)}. Score locked with ${plural(Math.round(this.daysRemaining()), 'day')} to spare.`, { final: true });
  }

  // ------------------------------------------------------------------ peer-to-peer exchange
  // A swap is escrow-first and checked at both ends. The proposer's side is held in s.escrow; the recipient checks the deal from THEIR side (what comes in is valued where they would hold it,
  // what goes out as it truly is), applies its side and replies; the proposer settles only a reply that is exactly what the offer asked for. Everything that arrives from outside is
  // cleaned first (_wire, _cleanOffer) and every check runs before the first change, so a refused swap changes nothing.
  /** What a classmate may see of a crate. One whose owner already knows its truth is shown as it truly is (quality carries the truth, `known` is set), so the room's price, the guardrail and the buyer's own value agree. */
  pub(a) {
    const d = a.known ? this._disclosed(a) : a;
    return { id: a.id, cls: a.cls, cond: a.cond, quality: d.quality, wear: a.wear, zone: a.zone, fmv: this.val(a), basis: a.basis, ...(a.known ? { known: true } : {}) };
  }
  /** A swap refused on what a crate is REALLY worth tells its owner (with no number) that something they hold is not what it looks like. That is an appraisal, and Read is what appraisals cost: the refusal charges
   *  SWAPS.appraisal of the described value it was refused at (at least a cent), is a ledger row and is counted (`s.meta.appraisals`), so it cannot be asked for nothing, crate after crate,
   *  to find the counterfeits in a lot. The fee is owed whatever the founder holds: it used to be cut to the cash in hand, and cash parked in an escrow (an offer of cash for the same cash, taken back after) made it
   *  nothing. A founder with less than the fee goes into overdraft for it, as for any other bill. */
  _appraisal(value) {
    const s = this.s, v = isNum(value) ? value : 0, fee = Math.max(0.01, Math.round(v * SWAPS.appraisal * 100) / 100);
    const m = (s.meta ||= {});
    m.appraisals = (m.appraisals || 0) + 1;
    s.cash -= fee; this.led('verify', 'Appraisal: a swap was refused on what a crate is worth', -fee, { fee });
  }
  /** Fair value of one side of an offer. `landing`: the crates are valued where THIS founder would hold them (one from a district they cannot enter lands in the nearest open one and is worth what it is worth there).
   *  `nw`: the net worth of whoever promises the royalty. */
  sideValue(side, opts) {
    const { landing = false, nw } = opts && typeof opts === 'object' ? opts : {};
    side = side || {};
    const m = this.mods(), at = (a) => (landing ? this._landing(a.zone) : a.zone);
    return (side.assets || []).reduce((x, a) => x + assetFMV(a, at(a), m, this.crowd(a.cls, at(a))), 0) + (side.cash || 0) + this._royaltyValue(side.royalty, nw);
  }
  /** A promised royalty is worth the least of what it promises, a tenth of what the promiser is worth (a stream is paid from cash they may not have) and what the days left in the run can still pay. */
  _royaltyValue(roy, nw) {
    if (!roy || !isNum(roy.perDay) || !isNum(roy.days) || roy.perDay <= 0 || roy.days <= 0) return 0;
    if (nw === undefined) nw = this.netWorth(); // the promiser is taken to be this founder unless the caller says whose net worth it is
    const cap = isNum(nw) ? Math.max(0, nw) * ROYALTY_NW : 0; // a promiser whose worth is not known promises nothing that can be counted
    return Math.min(roy.perDay * roy.days, cap, roy.perDay * Math.max(0, this.daysRemaining()));
  }
  /** The fair-value guardrail, from the checker's side. An offer of mine is checked as its proposer (what I ask for lands with me); anyone else's as its recipient (what they send lands with me).
   *  `landing: false` values every crate where it sits (what a founder can see for themselves), without relocating the ones that would land in another district. */
  checkOffer(offer, as, { landing } = {}) {
    const mine = as ? as === 'offerer' : !offer.from || offer.from === this.s.pid;
    const nw = isNum(offer.nw) ? offer.nw : mine ? this.netWorth() : 0; // an offer from a classmate that does not say what they are worth promises no royalty that counts
    const look = (lands) => {
      const va = this.sideValue(offer.give, { landing: lands === false ? false : !mine, nw }), vb = this.sideValue(offer.want, { landing: lands === false ? false : mine });
      const variance = fmvVariance(va, vb);
      return { va, vb, variance, ok: variance <= FMV_BAND, flagged: variance > FMV_BAND };
    };
    // A proposal of mine, asked about without saying how, is asked as createOffer asks it: both ways a founder can read it (each crate where it sits; the crates asked for where they would land with me) and the stricter
    // stands, so the preview and the proposal agree. It is `flagged` (extreme, and reported to the instructor) only when it is out of the band both ways: a bid for a crate from a district I have not opened that is fair
    // by what the crate is worth to me is no misconduct, only an offer nobody holding the crate can take.
    if (mine && landing === undefined) {
      const sits = look(false), lands = look(true), w = sits.variance >= lands.variance ? sits : lands;
      return { ...w, ok: sits.ok && lands.ok, flagged: !sits.ok && !lands.ok };
    }
    return look(landing);
  }
  /** What an asset would be worth in YOUR hands: Ops restores broken goods, Growth monetises digital ones. */
  projected(pubAsset, skills, mods = this.mods()) {
    const def = ASSETS[pubAsset.cls], z = pubAsset.zone;
    // Your own view is what the engine would really give you: your effective skills (a Background's bonus counts), your repair discounts (the district's, the Background's, the unlocked bonuses),
    // and your Background's pull on this kind of goods. A classmate's published levels are the raw ones, so theirs are priced with the district and the shocks only.
    const mine = !skills, k = mine ? { ops: this.lvl('ops'), growth: this.lvl('growth'), fintech: this.lvl('fintech') } : skills;
    const pv = mine ? this.perkValue(pubAsset.cls) : 1, crowd = mine ? this.crowd(pubAsset.cls, z) : 1;
    const working = assetFMV({ ...pubAsset, cond: 'ok', quality: 1, wear: pubAsset.wear ?? 1 }, z, mods, crowd);
    if (pubAsset.cond === 'broken' && def.repair) {
      const q = restoreQuality(k.ops), local = (1 - (ZONES[z].rules.repair || 0)) * (z > 4 ? mods.repair : 1); // repairMultFor(), read from the mods given
      return working * q * pv - repairCostFor(def.repair, k.ops, mine ? local * this.P.repairMult * this.B.repairMult : local);
    }
    if (def.tags.includes('digital')) return working * clamp(pubAsset.quality ?? 1, 0, 1.5) * Math.min(1.4, 0.7 + 0.1 * k.growth) * pv; // the crate's own quality counts (a known counterfeit is folded into it): `working` is priced at quality 1 for the restored-goods branch above
    return assetFMV(pubAsset, z, mods, crowd) * pv;
  }
  /** An asset leaves for a classmate as it truly is: what it is really worth is folded into its quality and the hidden truth stays behind, so a swap neither leaks the truth nor launders a counterfeit into a genuine crate. */
  _disclosed(a) {
    const c = { ...a };
    if (a.truth) c.quality = (a.quality ?? 1) * truthMult(a);
    delete c.truth; delete c.belief;
    c.known = true;
    return c;
  }
  /** A crate as its OWNER knows it, ready for the wire: the hidden truth is folded in only if the owner has already learned it (`known`). The first look of the guardrail uses this, so every number it can
   *  report to the founder, and every variance it can flag to the instructor, is made of things the founder could see for themselves. */
  _described(a) {
    return this._wire(a.known ? this._disclosed(a) : { ...a, truth: undefined, belief: undefined });
  }
  /** An asset as it may travel between founders, or null when it is not one: a known class and district, real numbers, a text id, and none of the hidden fields. A truth still on it is folded into the
   *  quality (a counterfeit is worth what it is worth) so nothing arriving can carry one; the owner's private basis is not sent. */
  _wire(a) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || a.id.length > 48 || !own(ASSETS, a.cls) || !Number.isInteger(a.zone) || !ZONE_IDS.includes(a.zone)) return null;
    const num = (x, lo, hi, d) => (isNum(x) ? clamp(x, lo, hi) : d);
    const c = { id: a.id, cls: a.cls, cond: a.cond === 'broken' ? 'broken' : 'ok', quality: num(a.quality, 0, 1.5, 1), wear: num(a.wear, 0, 1.5, 1), zone: a.zone };
    const t = a.truth;
    if (t && typeof t === 'object') c.quality *= t.fake ? FAKE_VALUE : num(t.q, 0, 1.5, 1);
    if (a.known || t) c.known = true;
    if (isNum(a.fmv)) c.fmv = a.fmv;
    return c;
  }
  /** A list of crates cleaned for the wire, repeated ids kept once; null when the list is not one (not an array, too long, or a crate that is not a crate). */
  _wireList(list) {
    if (list == null) return [];
    if (!Array.isArray(list) || list.length > OFFER_MAX * 2) return null;
    const out = [], seen = new Set();
    for (const a of list) {
      const c = this._wire(a);
      if (!c) return null;
      if (seen.has(c.id)) continue;
      seen.add(c.id); out.push(c);
    }
    return out.length > OFFER_MAX ? null : out;
  }
  /** An offer received from a classmate, cleaned: the same shape with only what the engine reads, numbers that are real, no hidden fields. Null when it is not an offer. */
  _cleanOffer(offer) {
    if (!offer || typeof offer !== 'object' || !offer.give || !offer.want || typeof offer.give !== 'object' || typeof offer.want !== 'object') return null;
    const give = this._wireList(offer.give.assets), want = this._wireList(offer.want.assets);
    if (!give || !want) return null;
    const cash = (x) => (x == null ? 0 : isNum(x) && x >= 0 ? x : NaN);
    const gc = cash(offer.give.cash), wc = cash(offer.want.cash);
    if (Number.isNaN(gc) || Number.isNaN(wc)) return null;
    let royalty = null;
    const r = offer.give.royalty;
    if (r) {
      if (typeof r !== 'object' || !isNum(r.perDay) || r.perDay <= 0 || !isNum(r.days) || r.days < 0.5 || r.days > TOTAL_DAYS) return null;
      royalty = { perDay: r.perDay, days: Math.round(r.days) };
    }
    const skills = {};
    for (const k of ['ops', 'growth', 'fintech']) if (isNum(offer.skills?.[k])) skills[k] = clamp(offer.skills[k], 0, 20);
    const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
    return { id: str(offer.id, 80), from: str(offer.from, 40), fromHandle: str(offer.fromHandle, 60), to: typeof offer.to === 'string' ? offer.to : null, nw: isNum(offer.nw) ? offer.nw : undefined, skills, give: { assets: give, cash: gc, royalty }, want: { assets: want, cash: wc } };
  }
  /** The district a crate would land in for this founder: its own if they can enter it, else the nearest open one below. */
  _landing(zone) {
    const s = this.s;
    if (s.zones.includes(zone)) return zone;
    const open = [...s.zones].sort((x, y) => y - x);
    return open.find((z) => z <= zone) ?? open[open.length - 1];
  }
  /** A swapped-in asset must sit in a district this founder can enter; otherwise it is delivered to the nearest open one. */
  _home(a) {
    const z = this._landing(a.zone);
    if (z !== a.zone) { a.zone = z; this.note('info', `${ASSETS[a.cls].name} was delivered to ${ZONES[z].short}, the nearest district you can enter.`); }
    return a;
  }
  /** A swapped-in crate takes its place in the founder's stock: in a district they can enter, never past its storage (a full one hands it to the nearest with room), and its basis is what it is worth THERE. */
  _arrive(a) {
    const s = this.s;
    this._home(a);
    if (this.roomIn(a.zone) <= 0) {
      const open = [...s.zones].sort((x, y) => Math.abs(x - a.zone) - Math.abs(y - a.zone) || y - x);
      const z = open.find((k) => this.roomIn(k) > 0);
      if (z != null) { a.zone = z; this.note('info', `${ASSETS[a.cls].name} was delivered to ${ZONES[z].short}: the district it was meant for was full.`); }
    }
    a.basis = assetFMV(a, a.zone, this.mods(), 1);
    s.assets.push(a);
    return a;
  }
  createOffer({ to, giveIds = [], giveCash = 0, want = { assets: [], cash: 0 }, royalty = null, note = '' } = {}) {
    const s = this.s;
    if (typeof to !== 'string' || !to) return fail('Choose who to trade with.');
    if (to === s.pid) return fail('You cannot trade with yourself.');
    if (!Array.isArray(giveIds) || giveIds.length > OFFER_MAX * 2) return fail('Offer something.');
    giveIds = uniq(giveIds);
    const assets = giveIds.map((id) => s.assets.find((a) => a.id === id));
    if (assets.some((a) => !a)) return fail('You no longer own one of those assets.');
    if (assets.length > OFFER_MAX) return fail('That is too many crates for one swap.');
    const sent = assets.map((a) => this._wire(this._disclosed(a)));
    if (sent.some((a) => !a)) return fail('One of those crates cannot be traded.');
    want = want && typeof want === 'object' ? want : {};
    const wanted = this._wireList(want.assets);
    if (!wanted) return fail('The crates you asked for are not valid.');
    giveCash = +giveCash || 0;
    const wantCash = +want.cash || 0;
    if (!isNum(giveCash) || !isNum(wantCash)) return fail('Cash must be an amount of money.');
    giveCash = Math.max(0, giveCash);
    let roy = null;
    if (royalty && +royalty.perDay > 0) {
      const perDay = +royalty.perDay, days = Math.round(+royalty.days);
      if (!isNum(perDay) || !isNum(days)) return fail('A royalty needs an amount a day and a number of days.');
      roy = { perDay, days: clamp(days, 1, TOTAL_DAYS) };
    }
    if (!assets.length && !giveCash && !roy) return fail('Offer something.');
    const askedIn = {}, goingOut = {};
    for (const w of wanted) { const z = this._landing(w.zone); askedIn[z] = (askedIn[z] || 0) + 1; }
    for (const a of assets) goingOut[a.zone] = (goingOut[a.zone] || 0) + 1;
    for (const [z, k] of Object.entries(askedIn)) if (k - (goingOut[z] || 0) > this.roomIn(+z)) return fail(`You would have no room in ${ZONES[z].short} for what you are asking for.`);
    const offer = {
      id: 'O' + s.pid + '-' + s.nid++, from: s.pid, fromHandle: s.handle, to, at: s.hour, note: typeof note === 'string' ? note.slice(0, 200) : '', nw: this.netWorth(),
      give: { assets: sent, cash: giveCash, royalty: roy },
      want: { assets: wanted, cash: Math.max(0, wantCash) },
      skills: { ...s.skills },
    };
    // Three looks, and only the first may speak in numbers or reach the instructor. (1) The crates as the founder DESCRIBES them, each where it sits: what they could work out for themselves. A deal that is off by
    // more than the band here is the Extreme Asymmetric Premium Warning and is flagged. (2) The same, with the crates asked for landing where this founder can hold them: a refusal that says so, never a flag
    // (an honest bid for a crate from a district they cannot enter is not misconduct). (3) The hidden truth of the founder's own crates: a counterfeit they have never inspected is refused with no number and no
    // flag, because a refusal that quoted what the crate is really worth would read its truth out to the one who holds it, for free.
    const asked = { ...offer, give: { ...offer.give, assets: assets.map((a) => this._described(a)) } };
    const seen = this.checkOffer(asked, 'offerer', { landing: false });
    offer.check = seen;
    const lands = this.checkOffer(asked, 'offerer', { landing: true });
    if (!seen.ok) {
      // ...but a bid that is fair by what the crate is worth to this founder (it would land somewhere else) is not misconduct, however far it is from the price its owner sees: refused, and said so, with nobody told
      if (lands.ok) return fail('Nobody can take that: a crate you asked for sits in a district you have not opened, where its owner values it far above what it would be worth to you. It was not sent.', { offer, chk: lands });
      this.out.push({ t: 'flag', offer: { id: offer.id, from: s.pid, to, variance: seen.variance, va: seen.va, vb: seen.vb } });
      return fail(`Extreme Asymmetric Premium Warning: this deal deviates ${(seen.variance * 100).toFixed(0)}% from fair market value (limit ${FMV_BAND * 100}%). It was blocked and flagged for your instructor.`, { offer, chk: seen });
    }
    if (!lands.ok) return fail(`This deal deviates ${(lands.variance * 100).toFixed(0)}% from fair market value once what you ask for lands in a district you can hold it in (limit ${FMV_BAND * 100}%). It was blocked.`, { offer, chk: lands });
    if (!this.checkOffer(offer, 'offerer', { landing: true }).ok) { this._appraisal(seen.va); return fail(UNTRADEABLE); }
    if (giveCash > s.cash) return fail('You do not have that much cash.');
    const going = new Set(giveIds);
    s.assets = s.assets.filter((a) => !going.has(a.id));
    s.cash -= giveCash;
    s.escrow.push({ offerId: offer.id, assets, cash: giveCash, at: s.hour, offer });
    this.led('p2p', `Proposed a swap to ${to}`, 0, { offer: offer.id });
    return ok('Offer sent. Your side is held in escrow until they answer.', { offer });
  }
  /** Crates a district can still take. Held, in freight and in escrow all count, and so does what an open swap has asked for: it holds the larger of the places it gave up (they come back if it is
   *  declined) and the places it asked for (they fill if it is accepted), so neither ending can overfill the district. */
  roomIn(zone) {
    const s = this.s;
    let used = s.assets.filter((a) => a.zone === zone).length + s.freight.reduce((n, f) => n + (f.to === zone ? f.items.length : 0), 0);
    for (const e of s.escrow) {
      const out = e.assets.filter((a) => a.zone === zone).length;
      const into = (e.offer?.want?.assets || []).filter((w) => this._landing(w.zone) === zone).length;
      used += Math.max(out, into);
    }
    return this.storeCap(zone) - used;
  }
  /** What a completed swap is worth to the run (config SWAPS). A swap with the Practice Partner teaches the mechanics and pays nothing: the event says so (`npc`), so no quest, achievement or bounty counts it. A swap with a
   *  classmate counts, and pays experience by the value that came in, only when it moves real value, at most SWAPS.perDay a day and once per partner a day: the same two tabs trading paperclips back and forth earn nothing. */
  _swapDone(peer, value, variance, npc) {
    const s = this.s;
    if (npc) { this.emit('p2p', { peer, variance, npc: true }); return false; }
    const book = (s.swapDay ||= { day: this.day, n: 0, peers: [] });
    if (book.day !== this.day) { book.day = this.day; book.n = 0; book.peers = []; }
    if (!(value >= SWAPS.minValue) || book.n >= SWAPS.perDay || book.peers.includes(peer)) return false;
    book.n++; book.peers.push(peer);
    s.p2p++; s.trades++; s.pivot++;
    this.xp(Math.min(SWAPS.xpMax, SWAPS.xpBase + SWAPS.xpScale * Math.log10(1 + value)));
    this.emit('p2p', { peer, variance });
    return true;
  }
  acceptOffer(offer, opts = {}) {
    const s = this.s, npc = !!opts?.npc; // npc: the counterparty is the Practice Partner, not a real player: no XP, no swap count, nothing owed back to it
    const o = this._cleanOffer(offer);
    if (!o) return fail('That offer is not valid.');
    if (o.from && o.from === s.pid) return fail('You cannot accept your own offer.');
    if (o.to != null && o.to !== s.pid) return fail('That offer was not made to you.');
    const seenKey = typeof o.id === 'string' ? `${o.from || ''}|${o.id}` : null; // an offer's id is its proposer's (`O<pid>-<n>`): another founder's offer with the same id is another offer
    if (seenKey && (s.accepted || []).includes(seenKey)) return fail('You already accepted that offer.'); // a message that arrives twice (or is sent twice) pays and delivers once
    // what I would send is checked as it truly is (a counterfeit is worth what it is worth), not as the proposer described it
    const mine = o.want.assets.map((w) => s.assets.find((a) => a.id === w.id && a.cls === w.cls && a.zone === w.zone));
    const held = mine.every(Boolean);
    // Two looks, as when proposing: first the crates as this founder DESCRIBES them (numbers are theirs to see), then as they truly are, which can only refuse, with no number (see createOffer).
    const sending = held ? mine.map((a) => this._wire(this._disclosed(a))) : o.want.assets;
    const seen = this.checkOffer({ ...o, want: { assets: held ? mine.map((a) => this._described(a)) : o.want.assets, cash: o.want.cash } }, 'acceptor');
    if (!seen.ok) return fail(`Blocked: ${(seen.variance * 100).toFixed(0)}% off fair market value.`, { chk: seen });
    const chk = this.checkOffer({ ...o, want: { assets: sending, cash: o.want.cash } }, 'acceptor');
    if (!chk.ok) { this._appraisal(seen.vb); return fail(UNTRADEABLE); }
    if (!held) return fail('You no longer hold the asset they asked for.');
    if (o.want.cash > s.cash) return fail('You do not have the cash they asked for.');
    if (npc && o.give.royalty) return fail('The Practice Partner does not pay royalties.');
    const inbound = {}, outbound = {};
    for (const a of o.give.assets) { const z = this._landing(a.zone); inbound[z] = (inbound[z] || 0) + 1; }
    for (const a of mine) outbound[a.zone] = (outbound[a.zone] || 0) + 1;
    for (const [z, k] of Object.entries(inbound)) if (k - (outbound[z] || 0) > this.roomIn(+z)) return fail(`There is no room in ${ZONES[z].short} for what they are sending.`);
    // ---- every check has passed: now the whole swap, with nothing left to fail
    const gone = new Set(mine);
    if (seenKey) { (s.accepted ||= []).push(seenKey); if (s.accepted.length > 200) s.accepted.shift(); }
    s.assets = s.assets.filter((a) => !gone.has(a));
    s.cash -= o.want.cash;
    const got = o.give.assets.map((a) => this._arrive({ id: 'A' + s.nid++, cls: a.cls, cond: a.cond, quality: a.quality, wear: a.wear, zone: a.zone, basis: 0, from: 'p2p', got: s.hour, known: true }));
    s.cash += o.give.cash;
    if (o.give.royalty) {
      // The most this stream can ever pay is what it promised, and no more than the fair-value check counted it for (with the band's headroom): a promise made by someone worth $1,000 was priced at $100, and a payer
      // whose messages say "a million a day" must not turn it into a million (the check priced the promise at what its maker is worth, never at the number written on it).
      const rv = this._royaltyValue(o.give.royalty, isNum(o.nw) ? o.nw : 0), cap = Math.min(o.give.royalty.perDay * o.give.royalty.days, rv * (1 + FMV_BAND));
      s.royalties.push({ dir: 'recv', peer: o.from, perDay: o.give.royalty.perDay, days: o.give.royalty.days, since: s.hour, until: s.hour + o.give.royalty.days * 24, got: 0, offer: o.id, cap });
    }
    this._swapDone(o.from, chk.va, chk.variance, npc);
    this.led('p2p', `Swapped with ${o.fromHandle || o.from}`, chk.va - chk.vb, { offer: o.id, peer: o.from, peerSkills: o.skills, gave: mine.map((a) => a.cls), got: got.map((a) => a.cls), va: chk.va, vb: chk.vb, variance: chk.variance, ...(npc ? { npc: true } : {}) });
    return ok('Deal done.', { deliver: { assets: sending, cash: o.want.cash }, chk });
  }
  /** The reply to an offer, if it is what the offer asked for: the same crates (ids and classes) and the same cash. Anything else is not that swap.
   *  The acceptor has ALREADY committed when this runs (it changed hands on its side at the confirmation), so a reply an honest acceptor can send must never be refused here: that is how a crate was made
   *  twice and the acceptor's cash and crate were destroyed. So the test is only what no honest reply fails: a crate keeps its id and class, but not its district (the acceptor may have moved it since the
   *  offer was described; it is credited where it would be worth less to this founder, never better than described), and the floor looks at crates and cash together (a counterfeit sent with the cash
   *  the deal also asked for is a fair deal the acceptor's own looks passed). */
  _delivered(o, delivery) {
    if (!delivery || typeof delivery !== 'object') return null;
    const list = this._wireList(delivery.assets), wanted = o.want?.assets || [];
    if (!list || list.length !== wanted.length) return null;
    const by = new Map(list.map((a) => [a.id, a]));
    const assets = [];
    for (const w of wanted) {
      const a = by.get(w.id);
      if (!a || a.cls !== w.cls) return null;
      // credited as the proposer described it and no better: what the reply says about a crate's quality, wear, condition and district is the replier's word, and a crate described as near-worthless (which the
      // guardrail priced as near-worthless) must not come back as a perfect one
      const c = { ...a, cond: a.cond === 'broken' || w.cond === 'broken' ? 'broken' : 'ok', quality: Math.min(a.quality, w.quality), wear: Math.min(a.wear, w.wear) };
      if (c.zone !== w.zone && this.sideValue({ assets: [{ ...c, zone: w.zone }] }, { landing: true }) <= this.sideValue({ assets: [c] }, { landing: true })) c.zone = w.zone;
      assets.push(c);
    }
    const want = o.want?.cash || 0, cash = delivery.cash == null ? 0 : delivery.cash;
    if (!isNum(cash) || Math.abs(cash - want) > 0.005) return null;
    // ...and a reply far worse than the description is not that swap: both ends' +/-40% checks could not have let it through, so nothing is credited and the escrow stays held
    const asked = this.sideValue({ assets: wanted, cash: want }, { landing: true }), came = this.sideValue({ assets, cash: want }, { landing: true });
    if (asked > 0 && came < asked * DELIVERY_FLOOR) return null;
    return { assets, cash: want };
  }
  /** `opts.npc`: the reply is the Practice Partner's (no XP, not a counted swap). `opts.from`: who sent the reply, when the caller knows it (the room tells it); it must be the one the offer was made to. */
  finalizeOffer(offerId, delivery, peerHandle = '', opts = {}) {
    const s = this.s, npc = !!opts?.npc, e = s.escrow.find((x) => x.offerId === offerId);
    if (!e) return fail('That offer is no longer open.');
    if (opts?.from != null && opts.from !== e.offer.to) return fail('That reply did not come from the person the offer was made to.');
    const o = e.offer, d = this._delivered(o, delivery);
    if (!d) return fail('That reply is not what the offer asked for, so nothing changed hands. Your escrow is still held.');
    s.escrow = s.escrow.filter((x) => x !== e);
    const got = d.assets.map((a) => this._arrive({ id: 'A' + s.nid++, cls: a.cls, cond: a.cond, quality: a.quality, wear: a.wear, zone: a.zone, basis: 0, from: 'p2p', got: s.hour, known: true }));
    s.cash += d.cash;
    if (o.give.royalty) {
      // The payer pays what the receiver will take: the promise, and no more than it was counted for when the swap was priced (the receiver's stream is capped the same way, acceptOffer). A promise larger than that
      // is a promise to burn money: the receiver refuses what is over it, and the payer's cash would be gone.
      const rv = this._royaltyValue(o.give.royalty, o.nw), cap = Math.min(o.give.royalty.perDay * o.give.royalty.days, rv * (1 + FMV_BAND));
      s.royalties.push({ dir: 'pay', peer: o.to, perDay: o.give.royalty.perDay, days: o.give.royalty.days, since: s.hour, until: s.hour + o.give.royalty.days * 24, offer: o.id, arrears: 0, cap, paid: 0 });
    }
    this._swapDone(o.to, this.sideValue({ assets: got, cash: d.cash }), o.check?.variance ?? 0, npc);
    const handle = typeof peerHandle === 'string' ? peerHandle.slice(0, 60) : '';
    this.led('p2p', `Swap completed with ${handle || o.to}`, this.sideValue({ assets: got, cash: d.cash }) - this.sideValue(o.give, { nw: o.nw }), { offer: o.id, peer: o.to, gave: e.assets.map((a) => a.cls), got: got.map((a) => a.cls), ...(o.check ? { va: o.check.va, vb: o.check.vb, variance: o.check.variance } : {}), ...(npc ? { npc: true } : {}) });
    return ok('Swap completed.');
  }
  /** Gives the escrow back. `from`: who asked, when the caller knows it (a decline from the room): it must be the one the offer was made to; the founder's own withdrawal passes none. */
  cancelOffer(offerId, reason = 'Offer withdrawn.', from) {
    const s = this.s, e = s.escrow.find((x) => x.offerId === offerId);
    if (!e || (from != null && from !== e.offer.to)) return fail('Not found.');
    s.escrow = s.escrow.filter((x) => x !== e);
    for (const a of e.assets) s.assets.push(a);
    s.cash += e.cash;
    return ok(reason);
  }
  _escrowExpiry() {
    const s = this.s;
    // an escrow a classmate is accepting right now (the session holds it for them, see Session._onAccept) is not given back under them: that is how a crate was destroyed on one side and made twice on the other
    for (const e of [...s.escrow]) if (s.hour - e.at > 72 && !(e.lockedBy && !e.lockLapsed)) { this.cancelOffer(e.offerId); this.out.push({ t: 'withdraw', offer: e.offerId, to: e.offer.to }); this.note('info', 'An unanswered offer expired and your escrow was returned.'); }
  }
  /** A royalty payment from a classmate. It is taken only for a stream this founder was promised (dir 'recv', that offer, and `from` when the caller knows who sent it), at most one day's amount at a time,
   *  never past what the stream promised in all or was counted for (`cap`), and never faster than the days go by: a stream is owed a day's rate for each day it has run (and the day in progress, and one in hand for
   *  a clock that runs a little behind), so a payer cannot send the whole of it at once. Everything else is ignored. The end date is not the limit, the total is: a payer short of cash pays its arrears late, and the
   *  last day's payment lands a little after the stream's last day anyway (the clocks of a room differ). `hour`: the hour to pace by when the caller knows the class's (this game can be behind it in a tab that was
   *  asleep: a message the payer sent on time must not be refused for that, with the payer's money gone). */
  receiveRoyalty(amount, offer, from, hour) {
    const s = this.s, r = s.royalties.find((x) => x.dir === 'recv' && x.offer === offer);
    if (!r || (from != null && from !== r.peer)) return fail('No such royalty stream.');
    if (!isNum(amount) || amount <= 0) return fail('Nothing to receive.');
    const total = r.cap ?? r.perDay * (r.days ?? Math.ceil((r.until - s.hour) / 24) + 1);
    const now = isNum(hour) ? Math.max(s.hour, hour) : s.hour;
    const due = isNum(r.since) ? r.perDay * (Math.floor(Math.max(0, now - r.since) / 24) + 2) : Infinity; // (a stream with no start, from a save of long ago, is not paced)
    const take = Math.min(amount, r.perDay, total - (r.got || 0), due - (r.got || 0));
    if (!(take >= 0.005)) return fail(due - (r.got || 0) < 0.005 && total - (r.got || 0) >= 0.005 ? 'That royalty is not due yet.' : 'That royalty stream has ended: it is paid up.');
    r.got = (r.got || 0) + take; s.cash += take;
    this.led('p2p', 'Royalty received', take, { offer });
    return ok(`Received ${money(take)}.`, { amount: take });
  }

  // ------------------------------------------------------------------ persistence, snapshots
  /** The day's checkpoint. _dayTick asks for it in the middle of an hour, but a state saved there has not yet run that hour's audits, margin call and peak, so a rewind-and-replay would take them an hour late
   *  and diverge. So inside stepHour the request is only noted and the state is saved at the END of the hour; outside it (a new game, a restored save) it is taken at once. */
  _checkpoint() {
    if (this._stepping) { this._ckptDue = true; return; }
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
  /** What a classmate may see of this run. `include`: ids of crates about to be offered in a swap, listed first so that they are in the published stock (it shows 24 crates, and a founder can hold far more): the
   *  classmate who gets the offer checks it against the stock this founder published (Session._onOffer). */
  publicSnapshot(include = []) {
    const s = this.s, nw = this.closedNetWorth(), first = new Set(Array.isArray(include) ? include.filter((x) => typeof x === 'string') : []);
    const stock = first.size ? [...s.assets.filter((a) => first.has(a.id)), ...s.assets.filter((a) => !first.has(a.id))] : s.assets;
    return {
      pid: s.pid, handle: s.handle, perks: [...s.perks], specialty: s.specialty, skills: { ...s.skills }, level: this.level(), hour: s.hour,
      nw, cash: s.cash, debt: this.debt(), startCap: s.startCapital, eei: this.eei(), zones: Math.max(...s.zones),
      pipelines: s.pipes.length, lastAutoHour: s.lastAuto, autoEligible: s.mil.m1 && !s.over, niches: this.niches48(),
      cmAvg: s.cm.n ? s.cm.sum / s.cm.n : 0, p2p: s.p2p, trades: s.trades, flags: { insolvent: s.insolvent, exited: !!s.exit, over: s.over, exiting: !!s.exiting },
      shockLog: s.shockLog.map((x) => ({ id: x.id, nw: x.nw, nwAfter: x.nwAfter, pivots: x.pivots, de: x.de })),
      hoursPlayed: Math.round((s.hour - s.startHour) / 24 * 10) / 10, auditFail: s.auditFail,
      inventory: stock.slice(0, 24).map((a) => this.pub(a)), mil: s.mil,
      plays: Object.fromEntries(['inspect', 'pitch', 'haggle', 'repair', 'auction', 'quick', 'played'].filter((k) => s.meta?.[k] != null).map((k) => [k, s.meta[k]])),
    };
  }
}

// ====================================================================================================================================================================================
// The run's gates and the argument guards. They wrap the public methods from outside, in one table, so a method's own code stays about its rules and a new method has to be placed here (tests/audit-engine-swaps.test.mjs).
// ====================================================================================================================================================================================
/** The reason the run takes no more actions, or '' while it does: it is over (the bell on day 90, or an exit that has settled) or an exit is settling (everything has been sold; the score locks when it lands). */
export const closedWhy = (g) => (g.s.over ? 'The run is over.' : g.s.exiting ? 'Your exit is settling.' : '');
/** Every public method that acts for the player. Once the run is closed each refuses with closedWhy() and changes nothing. Not in the list, on purpose: reads and quotes (and the notes), cancelOffer (it only
 *  gives the founder's own escrow back), injectEvent and rewindTo (the room's, not the player's), and the clock (advanceTo). exitQuote is a read, but there is nothing left to quote. */
export const CLOSED_METHODS = [
  'pitch', 'verifyLead', 'recordInspect', 'recordPlay', 'buyLot', 'passLead', 'passLot', 'repair', 'sellPool', 'ship', 'spendPoint', 'hirePipeline', 'configure', 'upgradePipeline', 'pausePipeline', 'releasePipeline',
  'buyUpgrade', 'acquireClient', 'draw', 'repay', 'resolveAudit', 'exit', 'exitQuote', 'createOffer', 'acceptOffer', 'finalizeOffer', 'receiveRoyalty',
];
const zoneArg = (z) => (typeof z === 'string' && /^\d+$/.test(z) ? +z : z); // a district id from a data attribute arrives as text
const goodZone = (z) => Number.isInteger(z) && ZONE_IDS.includes(z);
/** Per-method checks of what the caller passed, run before the method: they return a refusal, or nothing to let the call through (they may tidy the arguments in place). */
const ARGS = {
  createOffer: (g, a) => { if (!a[0] || typeof a[0] !== 'object' || Array.isArray(a[0])) a[0] = {}; },
  lotTruth: (g, a) => { a[0] = zoneArg(a[0]); if (!goodZone(a[0])) return null; },
  recordInspect: (g, a) => { a[0] = zoneArg(a[0]); if (!goodZone(a[0])) return fail('That lot is gone.'); },
  buyQuote: (g, a) => { a[0] = zoneArg(a[0]); if (!goodZone(a[0])) return fail('That lot is gone.'); },
  passLead: (g, a) => { a[0] = zoneArg(a[0]); if (!goodZone(a[0])) return fail('That buyer has left.'); },
  passLot: (g, a) => { a[0] = zoneArg(a[0]); if (!goodZone(a[0])) return fail('That lot is gone.'); },
  buyLot: (g, a) => {
    a[0] = zoneArg(a[0]);
    if (!goodZone(a[0])) return fail('That lot is gone.');
    // storage counts what an open swap has asked for too (roomIn), which buyLot's own count does not know
    if (g.s.lots[a[0]]?.some((l) => l.id === a[1]) && g.roomIn(a[0]) <= 0) return fail('Storage is full here (crates in transit, in escrow and promised to a swap count). Sell something or ship it out.');
  },
  hirePipeline: (g, a) => { a[1] = zoneArg(a[1]); if (!goodZone(a[1])) return fail('That district does not exist.'); if (!a[2] || typeof a[2] !== 'object') a[2] = {}; },
  configure: (g, a) => { if (!a[1] || typeof a[1] !== 'object') a[1] = {}; },
  poolQuote: (g, a) => { if (!Array.isArray(a[0])) return fail('Select assets to sell.'); a[0] = uniq(a[0]); },
  sellPool: (g, a) => { if (!Array.isArray(a[0])) return fail('Select assets to sell.'); a[0] = uniq(a[0]); },
};
/** Things to do with a method's result: realised trading profit is part of the day's profit, which the exit premium averages (it was fed by manager cycles alone). */
const AFTER = {
  pitch: (g, r) => { if (r?.ok) g.s.acc.profit += r.outcome === 'scam' ? -(r.asset?.basis || 0) : r.rejected || !isNum(r.profit) ? 0 : r.profit; },
  sellPool: (g, r) => { if (r?.ok && Array.isArray(r.per)) g.s.acc.profit += r.total - r.per.reduce((x, y) => x + (y.a.basis || 0), 0); },
};
/** Closed methods that still run in one case. finalizeOffer: the acceptor of a swap commits when the proposer CONFIRMS (Session._onConfirm), so a swap whose escrow is held for an acceptor is finished when their reply
 *  comes even if the bell rang or an exit began in between; refused, the acceptor's crate and cash are gone and the proposer's side is made twice. The escrow is the proof (only a confirmed one has `lockedBy`). */
const OPEN_WHEN = {
  finalizeOffer: (g, a) => g.s.escrow.some((e) => e.offerId === a[0] && e.lockedBy),
};
(function install() {
  const P = Game.prototype, shut = new Set(CLOSED_METHODS);
  for (const name of new Set([...CLOSED_METHODS, ...Object.keys(ARGS), ...Object.keys(AFTER)])) {
    const f = P[name];
    if (typeof f !== 'function') continue;
    P[name] = function guarded(...a) {
      if (shut.has(name)) { const why = closedWhy(this); if (why && !OPEN_WHEN[name]?.(this, a)) return fail(why); }
      const refused = ARGS[name]?.(this, a);
      if (refused !== undefined) return refused;
      const r = f.apply(this, a);
      AFTER[name]?.(this, r);
      return r;
    };
  }
  // the Bank drawer shows the reason on a loan it cannot draw: a closed run draws none
  const block = P.loanBlock;
  P.loanBlock = function loanBlock(...a) { return closedWhy(this) || block.apply(this, a); };
})();

export { obviousBuyer, utilityIn };
