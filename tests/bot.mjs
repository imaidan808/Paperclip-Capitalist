// A heuristic player that drives the same public API as the UI. Used for pacing calibration and end-to-end tests.
import { Game } from '../js/engine.js';
import { Cohort } from '../js/cohort.js';
import { ASSETS, BUYERS, PIPE, ZONES, UPGRADES, CLIENTS } from '../js/config.js';
import { restoreQuality } from '../js/market.js';

export function makeGame(profile = 'bootstrapper', specialty = 'ops', seed = 7) {
  const g = new Game({ profile, specialty, seed, handle: 'Bot', pid: 'BOT-1' });
  g.env.cohort = new Cohort({ seed: 'test', ghosts: 36 });
  return g;
}

export function decide(g, style = 'smart') {
  const s = g.s;
  if (s.over) return;
  if (s.auditPending) {
    const r = g.resolveAudit('A');
    if (!r.ok) g.resolveAudit(s.pipes.length ? 'B' : 'C');
  }
  // 1. best manual pitch
  let best = null;
  for (const z of s.zones) {
    for (const lead of s.leads[z]) for (const a of s.assets) {
      if (a.zone !== z) continue;
      const q = g.quotePitch(a.id, lead.id);
      if (!q.ok || q.rejected) continue;
      const score = q.received / Math.max(1e-6, q.fmv);
      if (score > 1.08 && (!best || score > best.score)) best = { a, lead, score };
    }
  }
  let acted = false;
  if (best) { g.pitch(best.a.id, best.lead.id); acted = true; }
  // 2. repair broken stock
  for (const a of s.assets.filter((x) => x.cond === 'broken')) {
    const q = g.repairQuote(a.id);
    if (q.ok && q.after - q.before > q.cost * 1.5 && s.cash > q.cost) g.repair(a.id);
  }
  // 3. source stock when there is little to sell
  const stock = s.assets.length;
  if (stock < 3 && s.cash > 0.5) {
    let pick = null;
    for (const z of s.zones) for (const lot of s.lots[z]) {
      if (lot.price > s.cash * 0.7 || lot.price < 0.01) continue;
      const def = ASSETS[lot.cls];
      const full = g.val({ cls: lot.cls, cond: 'ok', quality: lot.cond === 'broken' ? restoreQuality(g.lvl('ops')) : 1, wear: 1, zone: z });
      const ratio = full / (lot.price + (lot.cond === 'broken' ? 400 : 0));
      if ((ratio > 1.04 || lot.price < 1) && (!pick || ratio > pick.ratio)) pick = { z, lot, ratio };
    }
    if (pick) g.buyLot(pick.z, pick.lot.id);
  }
  // 4. dump stale stock into the pool
  const stale = s.assets.filter((a) => s.hour - a.got > 40);
  if (stale.length && s.pool[stale[0].zone] > 0) { for (const a of stale.slice(0, 2)) g.sellPool([a.id]); }
  // 5. training
  if (s.cash > 400 && g.lvl('ops') < 4) g.train('ops');
  else if (s.cash > 3000 && g.lvl('growth') < 4) g.train('growth');
  // 6. automation
  if (s.zones.includes(2) && !g.autoLocked()) {
    for (const k of ['jit', 'seo']) if (s.cash > UPGRADES[k].cost * 3) g.buyUpgrade(k);
    const zone = s.zones.includes(3) && s.cash > 80000 ? 3 : 2;
    if (s.pipes.filter((p) => p.zone === zone).length < 4) {
      const kind = 'broker';
      const cost = g.pipeCost(kind, zone);
      if (s.cash > cost * 2.2) {
        const lane = g.radar(zone, 12).filter((r) => r.band.id !== 'herd')[0];
        if (lane) g.hirePipeline(kind, zone, { cls: lane.cls, buyer: lane.seg, channel: s.hour > 74 * 24 ? 'dom' : 'intl' });
      }
    }
    for (const p of s.pipes) if (p.level < 8 && s.cash > g.pipeUpCost(p) * 1.8 && g.forecast(p).net > 0) g.upgradePipeline(p.id);
    for (const p of s.pipes) { // re-aim herd lanes
      const f = g.forecast(p);
      if (f.ci.band.id === 'herd' || f.net < 0) {
        const lane = g.radar(p.zone, 12).filter((r) => r.band.id !== 'herd')[0];
        if (lane && !p.inflight) g.configure(p.id, { cls: lane.cls, buyer: lane.seg });
      }
      if (p.channel === 'intl' && s.hour > 74 * 24 - 24 && !p.inflight) g.configure(p.id, { channel: 'dom' });
    }
    for (const t of Object.keys(CLIENTS)) {
      const q = g.clientQuote(t);
      if (CLIENTS[t].zone <= Math.max(...s.zones) && q.ratio > 3 && s.cash > q.cac * 2 && s.pipes.length >= CLIENTS[t].minRunning) g.acquireClient(t);
    }
    if (s.cash > 500) for (const a of s.assets.filter((x) => x.zone === 1 && s.zones.includes(2))) { const q = g.freightQuote([a.id], 2); if (q.ok && g.val(a, 2) > g.val(a) * 1.25 && s.cash > q.cost) g.ship([a.id], 2); }
  }
  // 7. bank: modest leverage once pipelines exist
  if (s.mil.m1 && s.pipes.length && !g.loanBlock('micro') && g.deRatio() < 0.8 && s.hour < 40 * 24) g.draw('micro', 2500);
  if (g.mods().rateBps > 0) for (const l of [...s.loans]) g.repay(l.id);
  else if (s.cash > 20000) for (const l of [...s.loans]) if (l.prod === 'micro') g.repay(l.id);
}

export function run(g, { days = 90, every = 2, onDay } = {}) {
  const marks = {};
  for (let h = 0; h < days * 24 && !g.s.over; h++) {
    g.advanceTo(g.s.hour + 1);
    if (h % every === 0) decide(g);
    const d = Math.floor(g.s.hour / 24) + 1;
    if (g.s.hour % 24 === 0) {
      const nw = g.netWorth();
      if (onDay) onDay(d, nw);
      for (const k of ['m1', 'm2', 'm3']) if (g.s.mil[k] && !marks[k]) marks[k] = d;
    }
  }
  return marks;
}
