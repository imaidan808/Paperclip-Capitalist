// A heuristic player that drives the same public API as the UI (Quick play: no Deal Room). Used for pacing calibration and end-to-end tests.
import { Game } from '../js/engine.js';
import { Cohort } from '../js/cohort.js';
import { ASSETS, ZONES, UPGRADES, CLIENTS } from '../js/config.js';
import { restoreQuality } from '../js/market.js';

export function makeGame(perks = [], specialty = 'ops', seed = 7) {
  const g = new Game({ perks, specialty, seed, handle: 'Bot', pid: 'BOT-1' });
  g.env.cohort = new Cohort({ seed: 'test', ghosts: 36 });
  return g;
}

export function decide(g) {
  const s = g.s;
  if (s.over) return;
  if (s.auditPending) {
    const r = g.resolveAudit('A');
    if (!r.ok) g.resolveAudit(s.pipes.length ? 'B' : 'C');
  }
  // 1. best manual pitch anywhere
  let best = null;
  for (const z of s.zones) {
    for (const lead of s.leads[z]) for (const a of s.assets) {
      if (a.zone !== z) continue;
      const q = g.quotePitch(a.id, lead.id, undefined, { blind: true }); // what a player may see: no peeking at hidden truth
      if (!q.ok || q.rejected) continue;
      const score = q.received / Math.max(1e-6, q.fmv);
      if (score > 1.08 && (!best || score > best.score)) best = { a, lead, score };
    }
  }
  if (best && g.P.scamRate && !best.lead.verified && g.verifyLead(best.lead.id).scam) best = null; // a Digital Native checks a buyer before shipping to them
  if (best) g.pitch(best.a.id, best.lead.id);
  // 2. repair broken stock
  for (const a of s.assets.filter((x) => x.cond === 'broken')) {
    const q = g.repairQuote(a.id);
    if (q.ok && q.after - q.before > q.cost * 1.5 && s.cash > q.cost) g.repair(a.id);
  }
  // 3. source stock when there is little to sell
  const want = 2 + Math.floor(s.zones.length / 3);
  if (s.assets.length < want && s.cash > 0.5) {
    let pick = null;
    for (const z of s.zones) for (const lot of s.lots[z]) {
      if (lot.price > s.cash * 0.8 || lot.price < 0.01) continue;
      if (lot.warn) continue; // the Second-Chance Hustler's free counterfeit warning
      const risky = (ZONES[z].rules.fakes || 0) * (ASSETS[lot.cls].fakeRisk ?? 1) > 0.05 && !g.P.fakeDetect;
      const full = g.val({ cls: lot.cls, cond: 'ok', quality: lot.cond === 'broken' ? restoreQuality(g.lvl('ops')) : 1, wear: 1, zone: z });
      const fix = lot.cond === 'broken' ? g.repairQuoteFor(lot.cls, z).cost : 0;
      const ratio = full / (lot.price + fix);
      if ((ratio > (risky ? 1.3 : 1.06) || lot.price < 1) && (!pick || ratio > pick.ratio)) pick = { z, lot, ratio };
    }
    if (pick) g.buyLot(pick.z, pick.lot.id);
  }
  // 4. dump stale stock into the pool
  for (const a of s.assets.filter((x) => s.hour - x.got > 40).slice(0, 2)) if (s.pool[a.zone] > 0) g.sellPool([a.id]);
  // 5. spend skill points: Ops first, then Growth, then Capital Sourcing
  while (s.points > 0) { const k = g.lvl('ops') < 4 ? 'ops' : g.lvl('growth') < 5 ? 'growth' : 'fintech'; if (!g.spendPoint(k).ok) break; }
  // 6. automation, from Metro Hub on
  const autoZones = s.zones.filter((z) => ZONES[z].auto);
  if (autoZones.length && !g.autoLocked()) {
    for (const k of ['jit', 'seo']) if (s.cash > UPGRADES[k].cost * 3) g.buyUpgrade(k);
    for (const zone of [...autoZones].reverse()) {
      if (s.pipes.filter((p) => p.zone === zone).length >= ZONES[zone].plots) continue;
      const cost = g.pipeCost('broker', zone);
      if (s.cash > cost * 2.2) {
        const lane = g.radar(zone, 14).filter((r) => r.band.id !== 'herd')[0];
        if (lane && g.hirePipeline('broker', zone, { cls: lane.cls, buyer: lane.seg, channel: s.hour > 74 * 24 ? 'dom' : 'intl' }).ok) break;
      }
    }
    for (const p of s.pipes) if (p.level < 8 && s.cash > g.pipeUpCost(p) * 1.8 && g.forecast(p).net > 0) g.upgradePipeline(p.id);
    for (const p of s.pipes) {
      const f = g.forecast(p);
      if ((f.ci.band.id === 'herd' || f.net < 0) && !p.inflight) {
        const lane = g.radar(p.zone, 14).filter((r) => r.band.id !== 'herd')[0];
        if (lane) g.configure(p.id, { cls: lane.cls, buyer: lane.seg });
      }
      if (p.channel === 'intl' && s.hour > 74 * 24 - 24 && !p.inflight) g.configure(p.id, { channel: 'dom' });
    }
    for (const t of Object.keys(CLIENTS)) {
      const q = g.clientQuote(t);
      if (s.zones.includes(CLIENTS[t].zone) && q.ratio > 3 && s.cash > q.cac * 3 && g.runningPipes() >= CLIENTS[t].minRunning + 1 && s.clients.length < g.runningPipes() - 1) g.acquireClient(t);
    }
  }
  // 7. carry stock to a better market one or two districts away
  if (s.zones.length > 1 && s.cash > 5) {
    for (const a of s.assets.slice(0, 6)) {
      for (const z2 of s.zones) {
        if (z2 === a.zone || Math.abs(z2 - a.zone) > 2) continue;
        const q = g.freightQuote([a.id], z2);
        if (q.ok && g.val(a, z2) > g.val(a) * 1.35 + q.cost && s.cash > q.cost && q.room > 0) { g.ship([a.id], z2); break; }
      }
    }
  }
  // 8. bank: modest leverage once managers exist
  if (s.mil.m1 && s.pipes.length >= 2 && !g.loanBlock('micro') && g.deRatio() < 0.35 && s.hour < 40 * 24 && s.loans.length === 0) g.draw('micro', 2500);
  if (g.mods().rateBps > 0) for (const l of [...s.loans]) g.repay(l.id);
  else if (s.cash > 20000) for (const l of [...s.loans]) if (l.prod === 'micro') g.repay(l.id);
}

/** Runs a game; returns the day each district gate was first passed. */
export function run(g, { days = 90, every = 2, onDay } = {}) {
  const marks = {};
  for (let h = 0; h < days * 24 && !g.s.over; h++) {
    g.advanceTo(g.s.hour + 1);
    if (h % every === 0) decide(g);
    const d = Math.floor(g.s.hour / 24) + 1;
    if (g.s.hour % 24 === 0) {
      if (onDay) onDay(d, g.netWorth());
      for (const z of g.s.zones) if (marks[z] == null) marks[z] = d;
    }
  }
  return marks;
}
