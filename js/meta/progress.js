// Quests, achievements, daily bounties and the Codex, tracked against the engine's event stream (docs/V2_DESIGN.md sections 7.1 and 12).
// State lives in game.s.meta, so it saves with the run and rewinds with it.
import { goalDelta, goalDone, matchEvent } from './match.js';
import { QUESTS, ACHIEVEMENTS, DAILIES } from './quests.js';
import { CODEX } from './codex.js';
import { hash01 } from '../rng.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const CODEX_BY_ID = byId(CODEX), QUEST_BY_ID = byId(QUESTS), ACH_BY_ID = byId(ACHIEVEMENTS);

export class Progress {
  /** hooks: { onComplete(kind, def), onCodex(entry) } so the UI can celebrate without this module touching the DOM. */
  constructor(game, hooks = {}) {
    this.g = game; this.hooks = hooks;
    for (const c of CODEX) if (c.unlock === 'start') this.m.cx[c.id] ??= 0;
  }
  /** The engine also keeps skill-game stats in s.meta (inspect, pitch, haggle, repair, auction, quick, played), so every key is ensured one by one. */
  get m() {
    const m = (this.g.s.meta ||= {});
    m.q ||= {}; m.a ||= {}; m.d ||= { day: 0, list: [] }; m.cx ||= {}; m.mission ||= {};
    return m;
  }

  isDone(id) { return !!this.m.q[id]?.done; }
  active(q) { return !this.isDone(q.id) && (!q.after || this.isDone(q.after)); }
  _reward(kind, def) {
    const r = def.reward || {};
    if (r.xp) this.g.xp(r.xp);
    if (r.points) this.g.s.points += r.points;
    this.hooks.onComplete?.(kind, def);
  }
  onEvent(evt) {
    const m = this.m;
    for (const q of QUESTS) {
      if (!this.active(q)) continue;
      const d = goalDelta(q.goal, evt);
      if (!d) continue;
      const st = (m.q[q.id] ||= { p: 0 });
      st.p += d;
      if (goalDone(q.goal, st.p)) { st.done = true; st.day = evt.day; this._reward('quest', q); }
    }
    for (const a of ACHIEVEMENTS) {
      if (m.a[a.id]?.done) continue;
      const d = goalDelta(a.goal, evt);
      if (!d) continue;
      const st = (m.a[a.id] ||= { p: 0 });
      st.p += d;
      if (goalDone(a.goal, st.p)) { st.done = true; st.day = evt.day; this._reward('achievement', a); }
    }
    if (evt.type === 'day') this._rollDailies(evt.day);
    for (const d of m.d.list) {
      if (d.done) continue;
      const delta = goalDelta(d.goal, evt);
      if (!delta) continue;
      d.p += delta;
      if (goalDone(d.goal, d.p)) { d.done = true; this._reward('daily', d); }
    }
    for (const c of CODEX) {
      if (m.cx[c.id] != null || typeof c.unlock !== 'object') continue;
      if (evt.type === c.unlock.event && matchEvent(c.unlock.match, evt)) this.unlockCodex(c.id, evt.day);
    }
  }
  _rollDailies(day) {
    const m = this.m;
    if (m.d.day === day) return;
    const seed = this.g.s.seed, pool = [...DAILIES], list = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const k = Math.floor(hash01(seed + ':d' + day + ':' + i) * pool.length);
      const t = pool.splice(k, 1)[0];
      list.push({ id: t.id, title: t.title, desc: t.desc, icon: t.icon, goal: t.goal, reward: t.reward, p: 0, done: false });
    }
    m.d = { day, list };
  }
  unlockCodex(id, day = this.g.day) {
    const e = CODEX_BY_ID[id];
    if (!e || this.m.cx[id] != null) return false;
    this.m.cx[id] = day;
    this.hooks.onCodex?.(e);
    return true;
  }
  codexUnlocked(id) { return this.m.cx[id] != null; }

  // ---- views for the drawers and the HUD
  quests() {
    return QUESTS.map((q) => {
      const st = this.m.q[q.id] || { p: 0 };
      return { def: q, p: st.p, n: q.goal.count, state: st.done ? 'done' : this.active(q) ? 'active' : 'locked' };
    });
  }
  achievements() {
    return ACHIEVEMENTS.map((a) => {
      const st = this.m.a[a.id] || { p: 0 };
      return { def: a, p: st.p, n: a.goal.count, done: !!st.done, hidden: !!a.hidden && !st.done };
    });
  }
  dailies() { return this.m.d.list; }
  /** The one objective the HUD tracker shows: the lowest-district quest that is active in a district the player can reach. */
  current() {
    const reach = Math.max(...this.g.s.zones) + 1;
    const act = this.quests().filter((x) => x.state === 'active' && x.def.zone <= reach).sort((a, b) => a.def.zone - b.def.zone);
    return act[0] || null;
  }
  codexList() { return CODEX.map((c) => ({ def: c, unlocked: this.m.cx[c.id] != null })); }
}
