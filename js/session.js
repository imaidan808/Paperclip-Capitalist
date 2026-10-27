// Session controller: clock, autosave, room protocol, leaderboard, gradebook. No DOM.
import { Game } from './engine.js';
import { Cohort, makeSynth, synthSnapshot, synthFlags, median } from './cohort.js';
import { Room } from './net.js';
import { SEC_PER_HOUR, TOTAL_HOURS, TOTAL_DAYS, EEI_FLOOR_DEFAULT, MIL, FMV_BAND, ASSETS } from './config.js';
import { eei as eeiCalc, gini, clamp, demandOf } from './market.js';

const slot = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('slot') || 'main';
const K = (n) => `pc.${n}.${slot}`;
export const kv = {
  get(n) { try { return JSON.parse(localStorage.getItem(K(n))); } catch { return null; } },
  set(n, v) { try { localStorage.setItem(K(n), JSON.stringify(v)); return true; } catch { return false; } },
  del(n) { try { localStorage.removeItem(K(n)); } catch { /* noop */ } },
};
export const SOLO_OFFLINE_CAP_H = 7 * 24;
export const SPEEDS = [0.25, 1, 4, 16, 64];

export class Clock {
  constructor(o = {}) { this.hour = o.hour || 0; this.wall = o.wall || Date.now(); this.speed = o.speed || 1; this.paused = !!o.paused; }
  now(w = Date.now()) { return Math.min(TOTAL_HOURS, this.paused ? this.hour : this.hour + (w - this.wall) / 1000 / SEC_PER_HOUR * this.speed); }
  set({ hour, speed, paused }) {
    const h = this.now();
    this.hour = hour ?? h; this.wall = Date.now();
    if (speed != null) this.speed = speed;
    if (paused != null) this.paused = paused;
  }
  toJSON() { return { hour: this.now(), wall: Date.now(), speed: this.speed, paused: this.paused }; }
}

const rid = () => 'PC-' + Math.random().toString(36).slice(2, 6).toUpperCase();

export class Session {
  constructor() {
    this.mode = 'solo';              // solo | student | instructor
    this.game = null;
    this.clock = new Clock({ speed: 1 });
    this.cohort = new Cohort({ seed: 'solo', ghosts: 36 });
    this.room = null; this.roomInfo = null;
    this.peers = new Map();          // pid -> { snap, seen, role }
    this.incoming = []; this.sent = new Map();
    this.flags = [];                 // peer-to-peer deals blocked by the +/-40% guardrail
    this.demo = 0; this.synth = [];
    this.difficulty = { friction: 1, audit: 1, eeiFloor: EEI_FLOOR_DEFAULT };
    this.ghosts = 36; this.algo = true;
    this.instructorSeen = 0; this.listeners = new Set();
    this.t = { snap: 0, save: 0, clock: 0, refresh: 0 };
    this.refreshMs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('refresh') ? +new URLSearchParams(location.search).get('refresh') * 1000 : 60000;
    this.pid = kv.get('pid') || (() => { const p = rid(); kv.set('pid', p); return p; })();
    this.handle = kv.get('handle') || '';
    this.npc = { id: 'NPC-PARTNER', handle: 'Practice Partner', skills: { ops: 1, growth: 6, fintech: 2 }, n: 0 };
    this.worldSeed = 'solo';
  }

  // ---- events
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }

  // ---- lifecycle
  startGame({ perks = [], specialty, handle, speed = 1 }) {
    this.handle = handle || 'Founder-' + this.pid.slice(3);
    kv.set('handle', this.handle);
    if (this.mode === 'solo') { this.clock = new Clock({ speed }); this.worldSeed = 'solo-' + Math.floor(Math.random() * 1e6); }
    const startHour = Math.floor(this.clock.now());
    this.game = new Game({ perks, specialty, handle: this.handle, pid: this.pid, startHour, worldSeed: this.worldSeed });
    this._wire();
    this.synth = this.mode === 'solo' ? makeSynth(11, this.worldSeed) : [];
    this.save(true);
    this._announce();
    return this.game;
  }
  _wire() {
    const g = this.game;
    g.env.cohort = this.cohort; g.env.difficulty = this.difficulty; g.env.worldSeed = this.worldSeed; g.env.algo = this.algo;
    this.cohort.seed = this.worldSeed; this.cohort.ghosts = this.ghosts;
    g.onNote = (n) => this.emit('note', n);
  }
  restore() {
    const d = kv.get('save');
    if (!d || d.v !== 1 || !d.state) return false;
    this.mode = d.mode === 'instructor' ? 'solo' : d.mode;
    this.worldSeed = d.worldSeed || 'solo';
    this.difficulty = { ...this.difficulty, ...(d.difficulty || {}) };
    this.clock = new Clock(d.clock);
    if (this.mode === 'solo') {
      const gap = this.clock.now() - d.state.hour;
      if (gap > SOLO_OFFLINE_CAP_H) this.clock.set({ hour: d.state.hour + SOLO_OFFLINE_CAP_H });
    }
    this.game = new Game({ state: d.state, worldSeed: this.worldSeed });
    this.handle = d.state.handle;
    this._wire();
    this.game._checkpoint();
    this.synth = this.mode === 'solo' ? makeSynth(11, this.worldSeed) : [];
    if (d.room && this.mode === 'student') this.joinRoom({ ...d.room, role: 'student' });
    return true;
  }
  save(force = false) {
    if (!this.game) return;
    const now = Date.now();
    if (!force && now - this.t.save < 4000) return;
    this.t.save = now;
    kv.set('save', { v: 1, mode: this.mode, worldSeed: this.worldSeed, difficulty: this.difficulty, clock: this.clock.toJSON(), room: this.roomInfo, state: this.game.s, savedAt: now });
  }
  reset() { kv.del('save'); this.leaveRoom(); this.game = null; this.mode = 'solo'; this.clock = new Clock({ speed: 1 }); this.peers.clear(); this.incoming = []; this.sent.clear(); this.cohort.setPeers([]); }

  // ---- room
  joinRoom({ code, relay = '', role = 'student', handle }) {
    this.leaveRoom();
    const h = handle || this.handle || 'Instructor';
    this.room = new Room({ code, pid: this.pid, handle: h, role, relay: relay || undefined });
    this.roomInfo = { code, relay, role };
    this.mode = role === 'instructor' ? 'instructor' : 'student';
    this.worldSeed = code;
    if (role === 'student') {
      this.clock.speed = 1;
      if (this.game) { this._wire(); }
    }
    this.room.on((m) => this._onMsg(m));
    this.room.onstate = () => this.emit('room');
    this.room.send({ t: 'hello' });
    if (this.game) this._sendSnap(true);
    this.emit('room');
  }
  leaveRoom() {
    if (this.room) this.room.close();
    this.room = null; this.roomInfo = null; this.peers.clear(); this.cohort.setPeers([]);
    if (this.mode !== 'solo') this.mode = 'solo';
    if (this.game) { this.worldSeed = this.worldSeed.startsWith('solo') ? this.worldSeed : 'solo-' + Math.floor(Math.random() * 1e6); this.game.env.worldSeed = this.worldSeed; }
  }
  alivePeers(ms = 30000) {
    const now = Date.now();
    return [...this.peers.values()].filter((p) => now - p.seen < ms);
  }
  leaderPid() {
    const ids = [this.pid, ...this.alivePeers().filter((p) => p.role === 'student').map((p) => p.snap?.pid || p.pid)];
    return ids.sort()[0];
  }

  _onMsg(m) {
    const g = this.game;
    switch (m.t) {
      case 'hello': this.peers.set(m.from, { ...(this.peers.get(m.from) || {}), pid: m.from, handle: m.handle, role: m.role, seen: Date.now() }); if (g) this._sendSnap(true); if (this.mode === 'instructor') this._sendClock(); break;
      case 'bye': this.peers.delete(m.from); this._syncCohort(); break;
      case 'snap': this.peers.set(m.from, { ...(this.peers.get(m.from) || {}), pid: m.from, handle: m.handle, role: m.role, snap: m.snap, seen: Date.now() }); this._syncCohort(); break;
      case 'clock': {
        const trusted = m.role === 'instructor' || (Date.now() - this.instructorSeen > 20000 && m.from === this.leaderPid());
        if (m.role === 'instructor') this.instructorSeen = Date.now();
        if (this.mode === 'student' && trusted) this._adoptClock(m);
        break;
      }
      case 'inject': if (g && this.mode === 'student') { g.injectEvent(m.kind, Math.max(Math.floor(this.clock.now()), m.atHour ?? 0), { id: m.id, replace: !!m.replace, injected: true }); this.emit('change'); } break;
      case 'rewind': if (g && this.mode === 'student') { const h = g.rewindTo(m.toHour); if (h != null) { this.clock.set({ hour: h }); this.emit('rewound', h); } } break;
      case 'offer': if (g && m.offer.to === this.pid) { this.incoming.push({ offer: m.offer, at: Date.now(), handle: m.handle }); this.emit('offer', m.offer); g.note('info', `${m.handle || 'A classmate'} proposed a swap. Open the Syndicate to review it.`); } break;
      case 'accept': if (g && m.to === this.pid) { const r = g.finalizeOffer(m.offerId, m.deliver, m.handle); this.sent.delete(m.offerId); g.note(r.ok ? 'good' : 'bad', r.ok ? `${m.handle || 'Your counterparty'} accepted. Swap completed.` : r.msg); this.emit('change'); } break;
      case 'decline': if (g && m.to === this.pid) { g.cancelOffer(m.offerId); this.sent.delete(m.offerId); g.note('info', `${m.handle || 'Your counterparty'} declined. Your escrow was returned.`); this.emit('change'); } break;
      case 'withdraw': this.incoming = this.incoming.filter((x) => x.offer.id !== m.offer); this.emit('change'); break;
      case 'royalty': if (g && m.to === this.pid) g.receiveRoyalty(m.amount, m.offer); break;
      case 'flag': if (this.mode === 'instructor') { this.flags.push({ ...m.offer, handle: m.handle, at: Date.now(), hour: Math.floor(this.clock.now()) }); this.emit('flag'); } break;
      default: break;
    }
  }
  _adoptClock(m) {
    this.clock.hour = m.hour; this.clock.wall = Date.now(); this.clock.speed = m.speed; this.clock.paused = m.paused;
    if (m.difficulty) Object.assign(this.difficulty, m.difficulty);
    if (m.ghosts != null) { this.ghosts = m.ghosts; this.cohort.ghosts = m.ghosts; this.cohort.refresh(); }
    if (m.algo != null) { this.algo = m.algo; if (this.game) this.game.env.algo = m.algo; }
  }
  _syncCohort() {
    const list = this.alivePeers(5 * 60000).filter((p) => p.role === 'student' && p.snap && p.snap.pid !== this.pid).map((p) => p.snap);
    this.cohort.setPeers(list);
  }
  _sendSnap(force) {
    if (!this.room || !this.game || this.mode === 'instructor') return;
    const now = Date.now();
    if (!force && now - this.t.snap < 4000) return;
    this.t.snap = now;
    this.room.send({ t: 'snap', snap: this.game.publicSnapshot() });
  }
  _sendClock() {
    if (this.mode !== 'instructor' || !this.room) return;
    this.t.clock = Date.now();
    this.room.send({ t: 'clock', hour: this.clock.now(), speed: this.clock.speed, paused: this.clock.paused, difficulty: this.difficulty, ghosts: this.ghosts, algo: this.algo });
  }
  _announce() { if (this.room && this.game) this._sendSnap(true); }

  // ---- the loop
  tick(wall = Date.now()) {
    if (this.mode === 'instructor') {
      if (wall - this.t.clock > 4000) this._sendClock();
      this.emit('tick');
      return;
    }
    const g = this.game;
    if (!g) return;
    const target = this.clock.now(wall);
    const before = g.s.hour;
    if (this.mode === 'student' && !this.clock.paused && wall - this.t.clock > 8000 && this.room && wall - this.instructorSeen > 20000 && this.leaderPid() === this.pid) { this.t.clock = wall; this.room.send({ t: 'clock', hour: target, speed: this.clock.speed, paused: this.clock.paused }); }
    if (target > g.s.hour) g.advanceTo(target);
    for (const m of g.out.splice(0)) this._deliver(m);
    if (this.room) this._sendSnap(false);
    if (wall - this.t.refresh > this.refreshMs) { this.t.refresh = wall; this.cohort.refresh(); this.emit('refresh'); }
    if (g.s.hour !== before) this.save();
    this.incoming = this.incoming.filter((x) => wall - x.at < 72 * SEC_PER_HOUR * 1000 / Math.max(this.clock.speed, 0.1));
    this.emit('tick');
  }
  _deliver(m) {
    if (!this.room) return;
    if (m.t === 'flag') this.room.send({ t: 'flag', offer: m.offer });
    else if (m.t === 'royalty') this.room.send({ t: 'royalty', to: m.to, amount: m.amount, offer: m.offer });
    else if (m.t === 'withdraw') { this.room.send({ t: 'withdraw', to: m.to, offer: m.offer }); this.sent.delete(m.offer); }
  }

  // ---- clock controls (solo player, or the instructor for the whole room)
  canSetClock() { return this.mode === 'solo' || this.mode === 'instructor'; }
  setSpeed(speed) { if (!this.canSetClock()) return; this.clock.set({ speed, paused: false }); this._sendClock(); this.save(true); this.emit('change'); }
  setPaused(paused) { if (!this.canSetClock()) return; this.clock.set({ paused }); this._sendClock(); this.save(true); this.emit('change'); }

  // ---- peer-to-peer
  roster() {
    const out = this.alivePeers(45000).filter((p) => p.role === 'student' && p.snap && p.snap.pid !== this.pid).map((p) => ({ pid: p.snap.pid, handle: p.snap.handle, perks: p.snap.perks, skills: p.snap.skills, inventory: p.snap.inventory || [], nw: p.snap.nw }));
    if (this.mode === 'solo' || !out.length) out.push(this.npcView());
    return out;
  }
  npcView() {
    const g = this.game, h = g ? g.s.hour : 0;
    const mk = (n, cls, cond, zone, quality) => ({ id: `${this.npc.id}-${n}`, cls, cond, quality, wear: 1, zone });
    // the practice partner trades whatever the first few districts sell, so there is always something to swap
    const have = Object.keys(ASSETS).filter((c) => ASSETS[c].dem && demandOf(ASSETS[c], 1) >= 4).slice(0, 5);
    const inv = have.map((c, i) => mk(i + 1, c, i % 3 === 2 && ASSETS[c].repair ? 'broken' : 'ok', 1, 1));
    return { pid: this.npc.id, handle: this.npc.handle, perks: ['pro', 'veteran'], skills: this.npc.skills, npc: true, inventory: inv.map((a) => ({ ...a, fmv: g ? g.val(a) : 0 })), nw: 0, hour: h };
  }
  propose(args) {
    const g = this.game, r = g.createOffer(args);
    if (!r.ok) { this.emit('change'); return r; }
    const offer = r.offer;
    this.sent.set(offer.id, { offer, at: Date.now() });
    if (args.to === this.npc.id) setTimeout(() => this._npcRespond(offer), 2500);
    else this.room?.send({ t: 'offer', to: args.to, offer });
    this.emit('change');
    return r;
  }
  _npcRespond(offer) {
    const g = this.game;
    if (!g || !g.s.escrow.some((e) => e.offerId === offer.id)) return;
    const chk = g.checkOffer(offer);
    if (chk.variance <= 0.3 && chk.vb > 0) {
      const wanted = offer.want.assets.map((w) => ({ ...w, quality: w.quality ?? 1, wear: 1, basis: w.fmv || 0 }));
      const fin = g.finalizeOffer(offer.id, { assets: wanted, cash: offer.want.cash }, this.npc.handle);
      g.note(fin.ok ? 'good' : 'bad', fin.ok ? 'Practice Partner accepted your swap.' : fin.msg);
    } else {
      g.cancelOffer(offer.id);
      g.note('info', `Practice Partner declined: they want a deal within 30% of fair value (yours was ${(chk.variance * 100).toFixed(0)}% off).`);
    }
    this.sent.delete(offer.id);
    this.emit('change');
  }
  acceptIncoming(offerId) {
    const i = this.incoming.find((x) => x.offer.id === offerId);
    if (!i) return { ok: false, msg: 'That offer expired.' };
    const r = this.game.acceptOffer(i.offer);
    if (r.ok) {
      this.room?.send({ t: 'accept', to: i.offer.from, offerId, deliver: r.deliver, handle: this.handle });
      this.incoming = this.incoming.filter((x) => x !== i);
    }
    this.emit('change');
    return r;
  }
  declineIncoming(offerId) {
    const i = this.incoming.find((x) => x.offer.id === offerId);
    if (i) { this.room?.send({ t: 'decline', to: i.offer.from, offerId, handle: this.handle }); this.incoming = this.incoming.filter((x) => x !== i); }
    this.emit('change');
  }
  withdraw(offerId) {
    const o = this.sent.get(offerId);
    const r = this.game.cancelOffer(offerId);
    if (o) this.room?.send({ t: 'withdraw', to: o.offer.to, offer: offerId });
    this.sent.delete(offerId);
    this.emit('change');
    return r;
  }

  // ---- instructor actions
  inject(kind, { when = 'now', replace = false, cls } = {}) {
    if (this.mode !== 'instructor') return;
    const h = Math.floor(this.clock.now());
    const at = when === 'now' ? h : h + when;
    const id = `inj-${kind}-${at}-${Math.floor(Math.random() * 1e4)}`;
    this.room?.send({ t: 'inject', kind, atHour: at, id, replace, cls });
    this.emit('change');
  }
  setDifficulty(patch) { Object.assign(this.difficulty, patch); this._sendClock(); this.emit('change'); }
  setGhosts(n) { this.ghosts = n; this.cohort.ghosts = n; this._sendClock(); this.emit('change'); }
  setAlgo(on) { this.algo = on; this._sendClock(); this.emit('change'); }
  rewind(days) {
    if (this.mode !== 'instructor') return;
    const to = Math.max(0, Math.floor(this.clock.now() / 24 - days) * 24);
    this.room?.send({ t: 'rewind', toHour: to });
    this.clock.set({ hour: to });
    this._sendClock();
    this.emit('change');
  }
  setDemo(n) {
    this.demo = n;
    this.synth = n ? makeSynth(n, this.room?.code || 'demo') : [];
    this.emit('change');
  }

  // ---- views
  hourNow() { return this.game ? this.game.s.hour : this.clock.now(); }
  /** Every student we know about, as comparable snapshots. */
  students() {
    const hour = this.mode === 'instructor' ? this.clock.now() : this.hourNow();
    const rows = this.alivePeers(10 * 60000).filter((p) => p.role === 'student' && p.snap).map((p) => ({ ...p.snap, seen: p.seen, online: Date.now() - p.seen < 20000 }));
    const mine = this.game && this.mode !== 'instructor' ? [{ ...this.game.publicSnapshot(), me: true, online: true }] : [];
    const syn = this.synth.map((s) => { const sn = synthSnapshot(s, hour); sn.eei = eeiCalc(sn.nw, sn.startCap, TOTAL_DAYS - hour / 24, this.difficulty.eeiFloor); sn.online = true; return sn; });
    const all = [...mine, ...rows.filter((r) => !mine.length || r.pid !== mine[0].pid), ...syn];
    return all;
  }
  leaderboard() {
    const rows = this.students().sort((a, b) => b.eei - a.eei);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  flagsAll() { return this.demo ? [...this.flags, ...synthFlags(this.synth, this.clock.now()).map((f) => ({ ...f, synth: true }))] : this.flags; }

  /** Pre-fills the LMS gradebook: 30% economic (percentile among all players: everyone starts with one paperclip, so no start is compared separately), 20% adaptability, 10% engagement. 40% reflection is the instructor's. */
  gradebook() {
    const rows = this.students();
    const hour = this.clock.now();
    const med = {};
    for (const id of new Set(rows.flatMap((r) => (r.shockLog || []).map((s) => s.id)))) {
      const ratios = rows.map((r) => (r.shockLog || []).find((s) => s.id === id)).filter((s) => s && s.nwAfter != null && s.nw > 0).map((s) => s.nwAfter / s.nw);
      med[id] = median(ratios);
    }
    return rows.map((r) => {
      const below = rows.filter((x) => x.eei < r.eei).length;
      const econ = rows.length > 1 ? (below / (rows.length - 1)) * 100 : 50;
      const shocks = (r.shockLog || []).filter((s) => s.nwAfter != null && s.nw > 0 && med[s.id] > 0);
      const adapt = shocks.length ? shocks.reduce((a, s) => a + clamp(50 + 50 * Math.tanh(Math.log((s.nwAfter / s.nw) / med[s.id]) * 3) + (s.pivots > 0 ? 10 : 0), 0, 100), 0) / shocks.length : null;
      const flagged = this.flagsAll().filter((f) => f.from === r.pid).length;
      const engage = clamp((r.p2p || 0) * 25 - flagged * 10, 0, 100);
      const auto = econ * 0.3 + (adapt ?? 50) * 0.2 + engage * 0.1;
      return { ...r, econ, adapt, engage, flagged, auto, autoMax: 60 };
    });
  }
}
