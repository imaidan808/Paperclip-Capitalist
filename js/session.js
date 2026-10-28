// Session controller: clock, autosave, room protocol, leaderboard, gradebook. No DOM.
//
// Everything that arrives from a room is untrusted (see the hygiene section of cohort.js). The room protocol, in short:
//   hello / bye / snap     presence and the public snapshot (rebuilt from a whitelist on arrival)
//   clock / inject / rewind  the instructor's: a student obeys only the instructor (or, with none, the lowest Founder ID for the clock)
//   offer                  a swap invitation; the proposer's side is already in escrow
//   accept -> confirm -> deliver -> ack   two steps: the acceptor ASKS, the proposer confirms it still holds the escrow (and locks it), only then does the
//                          acceptor hand over its side. A stale, withdrawn, rewound or forged accept changes nothing on either side. The acceptor has committed when it delivers, so it sends the delivery again,
//                          a few times, until the proposer says (`ack`) that it was taken: a delivery lost on the way (the proposer's connection dropped between its confirmation and the reply) is not the end of the swap.
//                          After five quick tries it goes on every 30 seconds for half an hour (and a committed swap survives a reload: the save carries it).
//   recall -> holding | free   when the proposer's hold has run out it asks the acceptor before it takes the escrow back: a committed acceptor says `holding` (and sends the delivery again, so the hold is renewed for five minutes),
//                          one that never committed says `free` (and forgets the offer, so a confirmation that comes late cannot commit). Silence for RECALL_WAIT_MS lets the hold go.
//   decline / withdraw / reject / abort   the ways out
//   royalty                one daily payment on a stream both sides really hold, never more in total than was agreed
//   rewound                a student telling the instructor how far its rewind could go
import { Game } from './engine.js';
import { Cohort, makeSynth, synthSnapshot, synthFlags, median, cleanSnap, cleanClock, cleanInject, cleanOffer, cleanAsset, cleanDifficulty, cleanId, DEFAULT_DIFFICULTY, num, text, nwCeiling } from './cohort.js';
import { Room, cleanCode } from './net.js';
import { SEC_PER_HOUR, TOTAL_HOURS, TOTAL_DAYS, EEI_FLOOR_DEFAULT, ASSETS, ZONES, SWAPS, EVENTS } from './config.js';
import { hash01 } from './rng.js';
import { eei as eeiCalc, clamp, demandOf, fmvVariance } from './market.js';

const slot = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('slot') || 'main';
const K = (n) => `pc.${n}.${slot}`;
export const kv = {
  get(n) { try { return JSON.parse(localStorage.getItem(K(n))); } catch { return null; } },
  set(n, v) { try { localStorage.setItem(K(n), JSON.stringify(v)); return true; } catch { return false; } },
  del(n) { try { localStorage.removeItem(K(n)); } catch { /* noop */ } },
  /** Text stored as it is (a checkpoint is already JSON: encoding it again would escape every quote). */
  getRaw(n) { try { return localStorage.getItem(K(n)); } catch { return null; } },
  setRaw(n, v) { try { localStorage.setItem(K(n), v); return true; } catch { return false; } },
};
export const SOLO_OFFLINE_CAP_H = 7 * 24;
export const SPEEDS = [0.25, 1, 4, 16, 64];
/** How long a student in a room waits for the class clock before it runs its own (no instructor and no lowest-ID student has spoken). */
export const CLOCK_WAIT_MS = 6000;

const MAX_PEERS = 450;                 // founders with a snapshot: a relay room holds 400 (server/relay.mjs) plus the instructor and some slack
const MAX_GHOSTS = 100;                // names that said hello and sent nothing else: a flood of them must never crowd out a student who has data
const MAX_FLAGS = 500;
const MAX_INCOMING = 24, MAX_INCOMING_PER = 6;
const ONLINE_MS = 20000;               // heard from in this long: online
const COHORT_MS = 2000;                // the market's view of the class is rebuilt at most this often, however many snapshots arrive
const ACCEPT_WAIT_MS = 30000;          // an acceptor waits this long for the proposer to confirm
const DELIVER_RETRY_MS = 5000, DELIVER_TRIES = 5; // an acceptor sends its delivery again after this long (then twice, three times as long...), this many times in all (the last at 80 seconds), until it is acknowledged
const DELIVER_SLOW_MS = 30000, DELIVER_HOLD_MS = 30 * 60000; // ...and then every 30 seconds until half an hour after it committed (then it says so and stops)
/** A proposer holds its escrow for an acceptor while the acceptor is making its quick tries: they run to DELIVER_RETRY_MS x DELIVER_TRIES squared (125 seconds) after it committed, and a confirmation
 *  can take up to the acceptor's own wait to arrive. A hold that lapsed sooner (it was a minute) let the proposer withdraw while a delivery was still on its way: the acceptor had committed, the proposer had its
 *  crate back, and the fourth try then arrived at an escrow that was gone. */
export const LOCK_MS = DELIVER_RETRY_MS * DELIVER_TRIES ** 2 + ACCEPT_WAIT_MS;
/** What the hold's end is not allowed to guess. A delivery lost for longer than the quick tries (the last was at 80 seconds, and the proposer's hold ran to 155) would be made twice: the acceptor has committed and the
 *  proposer, its hold over, takes its crate back. So the end of the hold is a question (`recall`): the proposer waits this long for the answer, and an acceptor that says `holding` (it has committed; the delivery
 *  is on its way) renews the hold for RENEW_MS, at most MAX_HOLDS times, so an acceptor that never delivers cannot keep the escrow out of its owner's hands for ever. */
export const RECALL_WAIT_MS = 60000;
const MAX_HOLDS = 6, RENEW_MS = 5 * 60000; // a `holding` renews the hold for five minutes, six times at most: about half an hour in all, as long as an acceptor goes on delivering (DELIVER_HOLD_MS)
const SHOCK_QUORUM = 3, SHOCK_BEYOND = 2.5; // a shock is graded when this many founders logged it, and a result more than this many times the class's median is not believed (Session.gradebook)
const RECOVER_WAIT_MS = 15000;      // a recovered instructor waits this long for the class's clock before it reads the hour off the snapshots
const MAX_SETTLED = 200;               // swaps remembered as settled (to acknowledge a repeated delivery)
const MAX_LOCKS = 2;                   // ...and holds one offer for a classmate at most this many times
const CKPT_KEEP = 9, CKPT_BUDGET = 2e6; // daily checkpoints kept across a reload: how many, and about how many characters in all
const RESERVED = /^(NPC|SYN)-/;
const peerId = (x) => { const id = cleanId(x); return id && id.length <= 24 && !RESERVED.test(id) ? id : null; };
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const usd = (x) => '$' + x.toFixed(2);

export class Clock {
  constructor(o) {
    o = o && typeof o === 'object' ? o : {}; // a save is read from storage: anything may be in it
    this.hour = Number.isFinite(o.hour) ? o.hour : 0;
    this.wall = Number.isFinite(o.wall) && o.wall ? o.wall : Date.now();
    this.speed = Number.isFinite(o.speed) && o.speed > 0 ? o.speed : 1;
    this.paused = !!o.paused;
  }
  now(w = Date.now()) { return Math.min(TOTAL_HOURS, Math.max(0, this.paused ? this.hour : this.hour + (w - this.wall) / 1000 / SEC_PER_HOUR * this.speed)); }
  set({ hour, speed, paused }) {
    const h = this.now();
    this.hour = hour ?? h; this.wall = Date.now();
    if (speed != null) this.speed = speed;
    if (paused != null) this.paused = paused;
  }
  toJSON() { return { hour: this.now(), wall: Date.now(), speed: this.speed, paused: this.paused }; }
}

const rid = () => 'PC-' + Math.random().toString(36).slice(2, 6).toUpperCase();
/** A secret that stays in this browser beside the Founder ID and proves to the relay that the one who connects as that ID is the one who first did (server/relay.mjs). 128 random bits as 32 hex characters. */
const newKey = () => {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('');
};

/** An owner token as typed or pasted (groups, dashes, spaces, any case): 32 hex characters, or null. */
export const cleanOwner = (x) => { const t = typeof x === 'string' ? x.replace(/[\s-]/g, '').toLowerCase() : ''; return /^[0-9a-f]{32}$/.test(t) ? t : null; };

export class Session {
  constructor() {
    this.mode = 'solo';              // solo | student | instructor
    this.game = null;
    this.clock = new Clock({ speed: 1 });
    this.cohort = new Cohort({ seed: 'solo', ghosts: 36 });
    this.room = null; this.roomInfo = null;
    this.peers = new Map();          // pid -> { pid, handle, role, snap, clean, seen }; kept for the life of the room, so a student who left is "away", not gone
    this.incoming = []; this.sent = new Map(); this.accepting = new Map();
    this.delivering = new Map();     // acceptor: offer id -> { to, payload, at, tries } for a swap it has committed to and not yet heard acknowledged
    this.settled = new Map();        // proposer: offer id -> who it was settled with, to acknowledge a delivery that comes again
    this.flags = [];                 // peer-to-peer deals blocked by the +/-40% guardrail
    this.demo = 0; this.synth = [];
    this.difficulty = DEFAULT_DIFFICULTY();
    this.ghosts = 36; this.algo = true;
    this.instructorSeen = 0; this.instructorPid = null; this.listeners = new Set();
    this.clockAdopted = true;        // a student in a room is false until the class clock has been heard, or none has come for CLOCK_WAIT_MS and the run goes on by itself
    this.clockHeard = true;          // ...and this one stays false until the class clock REALLY has been heard, however late: the first one rebases a run nobody has played yet
    this.joinedAt = 0;
    this.recovering = false;         // an instructor who took a running room back with its recovery code (a new device, or storage that was cleared): it knows nothing of the class's hour, and says nothing about it until it has heard it
    this.rewindReport = new Map();   // instructor: pid -> how far that student's rewind went
    this.injected = new Map();       // shock id -> the hour it begins: the shocks this room's instructor sent. With the scheduled ones and the algorithmic ones the seed rolls, the room's own record of what happened to it
    this.lastError = null;           // the last message that threw (the room carries on)
    this.ckDays = new Set(); this.ckSkip = new Set(); this.cohortDirty = false; this.rosterDirty = false;
    this.timers = { snap: 0, clock: 0 };
    this.t = { snap: 0, save: 0, clock: 0, refresh: 0, cohort: 0, roster: 0 };
    this.refreshMs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('refresh') ? +new URLSearchParams(location.search).get('refresh') * 1000 : 60000;
    this.pid = kv.get('pid') || (() => { const p = rid(); kv.set('pid', p); return p; })();
    this.key = (() => { const k = kv.get('key'); if (typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k)) return k; const n = newKey(); kv.set('key', n); return n; })();
    this.handle = kv.get('handle') || '';
    this.npc = { id: 'NPC-PARTNER', handle: 'Practice Partner', skills: { ops: 1, growth: 6, fintech: 2 }, n: 0, paid: { day: -1, cash: 0 } };
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
    // In a room the clock is the class's: until it has been heard the game stands at the clock's hour (0), and rebases onto the room's hour when it arrives (_rebase).
    const startHour = Math.floor(this.clock.now());
    this._clearCkpt();
    this.sent.clear(); this.accepting.clear(); this.delivering.clear(); this.settled.clear(); this.incoming = [];
    this.game = new Game({ perks, specialty, handle: this.handle, pid: this.pid, startHour, worldSeed: this.worldSeed });
    if (this.room) this.room.handle = this.handle; // the room has been calling this founder by the placeholder it joined with
    this._wire();
    this.synth = this.mode === 'solo' ? makeSynth(11, this.worldSeed) : [];
    this.save(true);
    this._announce();
    return this.game;
  }
  _wire() {
    const g = this.game;
    g.env.cohort = this.cohort; g.env.difficulty = this.difficulty; g.env.worldSeed = this.worldSeed; g.env.algo = this.algo;
    this.cohort.seed = this.worldSeed; this.cohort.ghosts = this.ghosts; this.cohort.refresh();
    g.onNote = (n) => this.emit('note', n);
    g.env.peerClosed = (pid) => { const f = this.peers.get(pid)?.snap?.flags; return f?.over === true || f?.exiting === true; }; // a royalty is not sent to a founder whose run is over, or who is selling the business (48 hours in which nothing is taken): they would refuse it and the money would be lost
  }
  restore() {
    const d = kv.get('save');
    if (!d || d.v !== 1 || !d.state || d.state.v !== 2 || !Array.isArray(d.state.perks)) return false; // a save from the three-profile game cannot be opened: it has no Backgrounds
    this.mode = d.mode === 'student' ? 'student' : 'solo';
    this.worldSeed = typeof d.worldSeed === 'string' && d.worldSeed ? d.worldSeed : 'solo';
    if (this.mode === 'student') Object.assign(this.difficulty, cleanDifficulty(d.difficulty)); // only a classroom has a difficulty of its own
    this.clock = new Clock(d.clock);
    // away for a long time: only a week comes back. (In a room the clock is the class's and is waited for; this is the fallback if nobody answers.)
    const gap = this.clock.now() - d.state.hour;
    if (gap > SOLO_OFFLINE_CAP_H) this.clock.set({ hour: d.state.hour + SOLO_OFFLINE_CAP_H });
    this.game = new Game({ state: d.state, worldSeed: this.worldSeed });
    this.handle = d.state.handle;
    this._wire();
    this._loadCkpt(d.state);
    if (!this.game.ckpt.has(Math.floor(this.game.s.hour / 24))) this.game._checkpoint();
    this._resync();
    this.synth = this.mode === 'solo' ? makeSynth(11, this.worldSeed) : [];
    const code = d.room && cleanCode(d.room.code);
    if (code && this.mode === 'student') { this.joinRoom({ code, relay: typeof d.room.relay === 'string' ? d.room.relay : '', role: 'student' }); this._loadDelivering(d.delivering); }
    else this.mode = 'solo';
    return true;
  }
  /** The swaps this side had committed to and not heard acknowledged when it was saved. Anything malformed is dropped. */
  _loadDelivering(list) {
    if (!Array.isArray(list)) return;
    for (const row of list.slice(-MAX_SETTLED)) {
      const [id, v] = Array.isArray(row) ? row : [], cid = cleanId(id), to = isObj(v) ? peerId(v.to) : null;
      if (!cid || !to || !isObj(v.payload) || cleanId(v.payload.offerId) !== cid) continue;
      this.delivering.set(cid, { to, payload: v.payload, at: num(v.at, 0, 1e15, Date.now()), last: num(v.last, 0, 1e15, 0) || undefined, tries: Math.round(num(v.tries, 1, 1000, 1)), name: text(v.name) });
    }
  }
  save(force = false) {
    if (!this.game) return;
    const now = Date.now();
    if (!force && now - this.t.save < 4000) return;
    this.t.save = now;
    // (`delivering` is a swap this side has committed to and not heard acknowledged: it must outlive a reload, or the proposer's recall would be answered `free` for a crate that is already gone from here)
    const delivering = this.mode === 'student' && this.delivering.size ? [...this.delivering].slice(-MAX_SETTLED) : undefined;
    kv.set('save', { v: 1, mode: this.mode, worldSeed: this.worldSeed, difficulty: this.mode === 'student' ? this.difficulty : undefined, clock: this.clock.toJSON(), room: this.roomInfo, state: this.game.s, delivering, savedAt: now });
  }
  reset() {
    kv.del('save'); this._clearCkpt(); this.leaveRoom(); this.game = null; this.mode = 'solo'; this.clock = new Clock({ speed: 1 });
    this.peers.clear(); this.incoming = []; this.sent.clear(); this.accepting.clear(); this.delivering.clear(); this.settled.clear(); this.flags = []; this.rewindReport.clear(); this.injected.clear(); this.cohort.setPeers([]);
  }

  // ---- room
  joinRoom({ code, relay = '', role = 'student', handle, owner, recover = false }) {
    code = String(code);
    const switching = this.roomInfo && this.roomInfo.code !== code;
    this._closeRoom();
    if (switching) this._resetRoomSettings();
    // a student who has not typed an alias yet is not "Instructor": the room shows them by their Founder ID until startGame gives them a name
    const h = handle || this.handle || (role === 'instructor' ? 'Instructor' : 'Founder-' + this.pid.slice(3));
    // An instructor brings the room's owner token (server/relay.mjs, `claim`): the one this browser made when it opened the room, or the one the instructor pasted from their copy of it (a new device, or storage that was cleared).
    // The relay hands the seat to whoever brings it, whatever Founder ID they have.
    const token = role === 'instructor' ? this._ownerFor(code, owner) : undefined;
    this.room = new Room({ code, pid: this.pid, key: this.key, handle: h, role, relay: relay || undefined, owner: token });
    this.roomInfo = { code, relay, role };
    this.mode = role === 'instructor' ? 'instructor' : 'student';
    this.worldSeed = code;
    // every role reads the same market: the instructor's heat map must show what the students' prices are made of
    this.cohort.seed = code; this.cohort.ghosts = this.ghosts; this.cohort.refresh();
    this.joinedAt = Date.now(); this.instructorSeen = 0; this.instructorPid = null;
    this.recovering = role === 'instructor' && recover === true;
    if (this.recovering) this.clock = new Clock({ hour: 0, paused: true, speed: 1 }); // (a clock of hour 0 sent to a class that is on day 40 would stand it still: see _sendClock)
    if (role === 'student') {
      // The class clock has not been heard yet, and a clock that is not the class's must not run the game (a saved one would play out the whole absence):
      // it stands still at the game's hour until the instructor's arrives.
      this.clockAdopted = false; this.clockHeard = false;
      this.clock = new Clock({ hour: this.game ? this.game.s.hour : 0, speed: 1, paused: true });
      if (this.game) this._wire();
    } else { this.clockAdopted = true; this.clockHeard = true; this._loadRoster(code); }
    this.room.on((m) => this._onMsg(m));
    this.room.onstate = () => this.emit('room');
    this.room.send({ t: 'hello' });
    if (this.game) this._sendSnap(true);
    this.emit('room');
  }
  _closeRoom() {
    if (this.room) this.room.close();
    this.room = null; this.roomInfo = null; this.peers.clear(); this.cohort.setPeers([]);
    for (const k of Object.keys(this.timers)) { if (this.timers[k]) clearTimeout(this.timers[k]); this.timers[k] = 0; }
    this.incoming = []; this.accepting.clear(); this.delivering.clear(); this.settled.clear(); this.flags = []; this.rewindReport.clear(); this.injected.clear(); this.cohortDirty = false;
  }
  /** What a classroom tunes belongs to the classroom: leaving it, or starting a new one, puts every dial back. */
  _resetRoomSettings() {
    Object.assign(this.difficulty, DEFAULT_DIFFICULTY());
    this.ghosts = 36; this.algo = true; this.cohort.ghosts = 36; this.cohort.refresh();
    if (this.game) this.game.env.algo = true;
  }
  leaveRoom() {
    const closing = this.mode === 'instructor' && this.room;
    this._closeRoom();
    if (closing) kv.del('roster');
    if (this.mode !== 'solo') this.mode = 'solo';
    if (!this.clockAdopted && this.game) this.clock.set({ hour: this.game.s.hour, paused: false, speed: 1 }); // the class clock never came: the solo run keeps running
    this.clockAdopted = true; this.clockHeard = true;
    this._resetRoomSettings();
    if (this.game) { this.worldSeed = this.worldSeed.startsWith('solo') ? this.worldSeed : 'solo-' + Math.floor(Math.random() * 1e6); this.game.env.worldSeed = this.worldSeed; this.cohort.seed = this.worldSeed; }
  }
  /** The owner token of an instructor's room: 32 hex characters, made here the first time the room is opened and kept in this browser beside the room's code. A pasted one (any spacing or dashes) replaces it. */
  _ownerFor(code, pasted) {
    const all = kv.get('owners'), owners = isObj(all) ? all : {};
    const given = cleanOwner(pasted), token = given || (typeof owners[code] === 'string' && cleanOwner(owners[code])) || newKey();
    if (owners[code] !== token) { owners[code] = token; kv.set('owners', owners); }
    return token;
  }
  /** What the instructor keeps to run this room from another device, or after this browser forgets it: the owner token in groups of four. Null when this is not an instructor's room. */
  recoveryCode() {
    const code = this.roomInfo?.code;
    if (this.mode !== 'instructor' || !code) return null;
    return this.recoveryCodeFor(code);
  }
  /** The same for a room this browser made, by its code (the title screen shows it beside "Reopen room"). Null for a code this browser never opened as an instructor. */
  recoveryCodeFor(code) {
    const all = kv.get('owners'), t = isObj(all) && typeof code === 'string' && Object.prototype.hasOwnProperty.call(all, code) ? cleanOwner(all[code]) : null;
    return t ? t.replace(/(.{4})(?=.)/g, '$1-') : null;
  }
  /** A recovered room has heard the class's hour (or waited long enough): from here on it keeps the clock. The class's dials (difficulty, herd, events) are the room's own and come back at their defaults. */
  _recovered(hour, speed, paused) {
    this.clock = new Clock({ hour: Math.min(TOTAL_HOURS, Math.max(0, hour)), speed: Number.isFinite(speed) && speed > 0 ? speed : 1, paused: paused !== false });
    this.recovering = false;
    this.emit('change');
  }
  alivePeers(ms = 30000) {
    const now = Date.now();
    return [...this.peers.values()].filter((p) => now - p.seen < ms);
  }
  leaderPid() {
    const ids = [this.pid, ...this.alivePeers().filter((p) => p.role === 'student').map((p) => p.snap?.pid || p.pid)];
    return ids.sort()[0];
  }

  // ---- what arrives
  _onMsg(m) {
    if (!isObj(m) || typeof m.t !== 'string') return;
    const from = peerId(m.from);
    if (!from || from === this.pid) return;
    try { this._handle(m, from); } catch (e) { this.lastError = e; } // one bad message must never stop the room
  }
  /** The instructor is whoever says so first; another pid claiming it is believed only after the first has been silent for a minute. */
  _isInstructor(m, from) {
    if (m.role !== 'instructor') return false;
    return !this.instructorPid || from === this.instructorPid || Date.now() - this.instructorSeen > 60000;
  }
  _handle(m, from) {
    const g = this.game;
    switch (m.t) {
      case 'hello': {
        this._admit(from, false);
        if (!this._peer(from, m)) return;
        if (this.mode === 'instructor') this._clockSoon(); else if (g) this._snapSoon();
        break;
      }
      case 'bye': {
        const p = this.peers.get(from);
        if (p && !p.snap) this.peers.delete(from); else if (p) { p.seen = 0; this.rosterDirty = true; } // a student who left is away, and keeps their last snapshot for the gradebook
        this._flushCohort();
        break;
      }
      case 'snap': {
        if (m.role !== 'student') return;
        const snap = cleanSnap(m.snap, from);
        const p = snap && this._admit(from, true) && this._peer(from, m);
        if (!p) return;
        p.snap = snap; p.clean = true; this.rosterDirty = true;
        this._syncCohort();
        break;
      }
      case 'clock': {
        const c = cleanClock(m);
        if (!c) return;
        if (this.mode === 'instructor' && this.recovering && m.role === 'student') { this._recovered(c.hour + (c.paused ? 0 : c.age / 1000 / SEC_PER_HOUR * c.speed), c.speed, c.paused); break; } // the class's clock, kept by the student standing in for the instructor
        const instr = this._isInstructor(m, from);
        const trusted = instr || (Date.now() - this.instructorSeen > 20000 && from === this.leaderPid());
        if (instr) { this.instructorSeen = Date.now(); this.instructorPid = from; }
        if (this.mode === 'student' && trusted) this._adoptClock(c, instr);
        break;
      }
      case 'inject': {
        if (!g || this.mode !== 'student' || !this._isInstructor(m, from)) return;
        const c = cleanInject(m, Math.floor(this.clock.now()));
        if (!c) return;
        g.injectEvent(c.kind, c.atHour, { id: c.id, replace: c.replace, injected: true, cls: c.cls });
        this._noteShock(c.id, c.atHour);
        this.emit('change');
        break;
      }
      case 'rewind': if (g && this.mode === 'student' && this._isInstructor(m, from)) this._rewind(m.toHour, from); break;
      case 'rewound': this._onRewound(m, from); break;
      case 'offer': this._onOffer(m, from); break;
      case 'accept': this._onAccept(m, from); break;
      case 'confirm': this._onConfirm(m, from); break;
      case 'deliver': this._onDeliver(m, from); break;
      case 'ack': { const d = cleanId(m.offerId) && this.delivering.get(m.offerId); if (d && d.to === from && m.to === this.pid) this.delivering.delete(m.offerId); break; }
      case 'recall': this._onRecall(m, from); break;
      case 'holding': this._onHolding(m, from); break;
      case 'free': this._onFree(m, from); break;
      case 'abort': this._onAbort(m, from); break;
      case 'reject': this._onReject(m, from); break;
      case 'decline': this._onDecline(m, from); break;
      case 'withdraw': {
        const id = cleanId(m.offer);
        this.incoming = this.incoming.filter((x) => !(x.offer.id === id && x.offer.from === from));
        const p = this.accepting.get(id);
        if (p && p.from === from) this.accepting.delete(id);
        this.emit('change');
        break;
      }
      case 'royalty': this._onRoyalty(m, from); break;
      case 'flag': this._onFlag(m, from); break;
      default: break;
    }
  }
  /** Room for a classmate in the table, before the record is made. Two kinds are counted apart: a founder with a snapshot (at most MAX_PEERS: only one silent for ten minutes is replaced) and a name that has only said hello
   *  (at most MAX_GHOSTS: the stalest goes, so a flood of hellos, from a script that opens a connection, greets and leaves, can never fill the table and keep a real student out of the gradebook). */
  _admit(from, withSnap) {
    const have = this.peers.get(from);
    if (have && (have.snap || !withSnap)) return true;                   // already here as what it is
    const founders = [], ghosts = [];
    for (const q of this.peers.values()) (q.snap ? founders : ghosts).push(q);
    const stalest = (list) => list.reduce((w, q) => (!w || q.seen < w.seen ? q : w), null);
    if (!withSnap) { if (ghosts.length >= MAX_GHOSTS) this.peers.delete(stalest(ghosts).pid); return true; }
    if (founders.length < MAX_PEERS) return true;
    const w = stalest(founders);
    if (w && Date.now() - w.seen > 10 * 60000) { this.peers.delete(w.pid); return true; }
    return false;
  }
  /** The record of a classmate, made on first sight (the table is bounded, see _admit) and refreshed by every hello or snapshot. */
  _peer(from, m) {
    let p = this.peers.get(from);
    if (!p) {
      p = { pid: from, handle: '', role: 'student', seen: 0 };
      this.peers.set(from, p);
    }
    const h = text(m.handle);
    if (h) p.handle = h;
    p.role = m.role === 'instructor' ? 'instructor' : 'student';
    // a message the relay replays carries how old it is, so a late joiner is not told that a founder who left an hour ago is online
    const age = typeof m.age === 'number' && Number.isFinite(m.age) ? Math.min(Math.max(m.age, 0), 6e5) : 0;
    p.seen = Date.now() - age;
    return p;
  }
  /** `fromInstructor`: only the instructor's clock may change the class's settings (difficulty, the herd, the algorithmic events); a student standing in for them carries the hour, the speed and the pause alone. */
  _adoptClock(c, fromInstructor = false) {
    const first = !this.clockHeard;
    const lag = c.paused ? 0 : c.age / 1000 / SEC_PER_HOUR * c.speed; // the relay replays the last clock to a joiner: it is a moment old
    this.clock.hour = Math.min(TOTAL_HOURS, c.hour + lag); this.clock.wall = Date.now(); this.clock.speed = c.speed; this.clock.paused = c.paused;
    this.clockAdopted = true; this.clockHeard = true;
    if (fromInstructor && c.difficulty) Object.assign(this.difficulty, c.difficulty);
    if (fromInstructor && c.ghosts != null) { this.ghosts = c.ghosts; this.cohort.ghosts = c.ghosts; this.cohort.refresh(); }
    if (fromInstructor && c.algo != null) { this.algo = c.algo; if (this.game) this.game.env.algo = c.algo; }
    if (first) this._rebase();
  }
  /** A run that has not been played, started before the class clock was heard, starts again at the class's hour (everyone starts identical, whenever they sit down). Not played means nothing bought, sold, swapped,
   *  signed or borrowed and no skill point spent. Time that passed on its own (the clock came late and the game ran by itself meanwhile) and lessons played on the title screen (their XP, skill points and Codex pages
   *  are paid into the run when it starts) do not make it a played one: the lessons' rewards are carried to the new run. A run that has lived a day or more under its own clock is the student's own (a restored run that
   *  sat idle for days is not begun again). */
  _rebase() {
    const g = this.game;
    if (!g) return;
    const s = g.s, h = Math.floor(this.clock.hour);
    const idle = s.hour - s.startHour < 24 && s.ledger.length === 0 && s.escrow.length === 0 && s.assets.length === 1 && !s.pipes.length && !s.loans.length && !s.clients.length && !s.freight.length && !s.trades
      && Object.values(s.skills).reduce((a, b) => a + b, 0) <= (s.specialty ? 5 : 3); // three skills at 1, and the specialty at 3: a point spent is a run begun
    if (!idle || h <= s.startHour) return;
    const keep = s.meta && (s.meta.cx || s.meta.mission) ? { cx: s.meta.cx || {}, mission: s.meta.mission || {} } : null;
    try {
      const fresh = g._new({ perks: s.perks, handle: s.handle, pid: s.pid, seed: s.seed, specialty: s.specialty, startHour: h }); // (puts the new state in place)
      Object.assign(fresh, { xp: s.xp, points: s.points, lvlPaid: s.lvlPaid });
      if (keep) fresh.meta = keep;
      g.ckpt.clear(); g._checkpoint();
    } catch { g.s = s; return; } // could not begin again: the run carries on from where it is and catches up
    g._m = null;
    this._clearCkpt(); this.sent.clear(); this.save(true);
    this._sendSnap(true);
    this.emit('change');
  }
  _syncCohort() { this.cohortDirty = true; if (Date.now() - this.t.cohort >= COHORT_MS) this._flushCohort(); }
  _flushCohort() {
    this.cohortDirty = false; this.t.cohort = Date.now();
    const list = this.alivePeers(5 * 60000).filter((p) => p.role === 'student' && p.snap && p.pid !== this.pid).map((p) => p.snap);
    this.cohort.setPeers(list);
  }
  /** Joiners are told what the room looks like by the relay (it replays the last snapshot of everyone still connected). Over a browser's own tabs there is no relay: answer once, soon, with a little jitter. */
  _snapSoon() {
    if (this.room?.kind === 'relay' || this.timers.snap) return;
    this.timers.snap = setTimeout(() => { this.timers.snap = 0; this._sendSnap(true); }, Math.random() * 400);
  }
  _clockSoon() {
    if (this.room?.kind !== 'relay') { this._sendClock(); return; }
    if (this.timers.clock) return; // a class joining at once is answered by one clock a second, not one each
    this.timers.clock = setTimeout(() => { this.timers.clock = 0; this._sendClock(); }, Math.max(0, 1000 - (Date.now() - this.t.clock)));
  }
  /** `include`: ids of the crates an offer is about to take out of the stock, listed first in the published stock (the classmate who gets the offer checks it against that stock). */
  _sendSnap(force, include) {
    if (!this.room || !this.game || this.mode === 'instructor') return;
    const now = Date.now();
    if (!force && now - this.t.snap < 4000) return;
    this.t.snap = now;
    this.room.send({ t: 'snap', snap: this.game.publicSnapshot(include) });
  }
  _sendClock() {
    if (this.mode !== 'instructor' || !this.room || this.recovering) return; // a recovered room has not heard the class's hour yet: the clock it would send is a made-up one
    this.t.clock = Date.now();
    this.room.send({ t: 'clock', hour: this.clock.now(), speed: this.clock.speed, paused: this.clock.paused, difficulty: cleanDifficulty(this.difficulty), ghosts: this.ghosts, algo: this.algo });
  }
  _tell(to, t, extra = {}) { this.room?.send({ t, to, ...extra }); }
  _announce() { if (this.room && this.game) this._sendSnap(true); }

  // ---- rewind
  /** The instructor rewound the class. A student restores the newest daily checkpoint at or before that hour; one who has none that old (a reload keeps only the last few days) goes back as far as it can, and says so. */
  _rewind(toHour, from) {
    const g = this.game, wanted = num(toHour, 0, TOTAL_HOURS, null);
    if (wanted == null) return;
    let got = null;
    try {
      got = g.rewindTo(wanted);
      if (got == null) { const first = Math.min(...g.ckpt.keys()); if (Number.isFinite(first) && first * 24 < g.s.hour) got = g.rewindTo(first * 24); }
    } catch { got = null; }
    const reached = g.s.hour;
    this._tell(from, 'rewound', { wanted, hour: reached, ok: got != null && reached <= wanted + 24 });
    if (got != null) {
      this.clock.set({ hour: got });
      this.incoming = []; this.accepting.clear(); this.delivering.clear(); this.settled.clear(); this._resync();      // invitations and escrows of a future that no longer happened
      this.emit('rewound', got);
    } else g.note('warn', 'Your instructor rewound the class, but you have no saved checkpoint that old. Your run stays where it is until the class catches up.');
  }
  _onRewound(m, from) {
    if (this.mode !== 'instructor' || m.to !== this.pid || m.role !== 'student') return;
    const p = this.peers.get(from);
    this.rewindReport.set(from, { pid: from, handle: p?.handle || from, wanted: num(m.wanted, 0, TOTAL_HOURS, 0), hour: num(m.hour, 0, TOTAL_HOURS, 0), ok: m.ok === true, at: Date.now() });
    this.emit('change');
  }
  /** The escrows a game holds are the offers it has out. */
  _resync() {
    this.sent.clear();
    for (const e of this.game.s.escrow) if (isObj(e.offer) && typeof e.offerId === 'string') this.sent.set(e.offerId, { offer: e.offer, at: Date.now() });
  }
  _persistCkpt() {
    const g = this.game;
    if (!g || this.mode !== 'student') return;
    const days = [...g.ckpt.keys()].sort((a, b) => b - a).slice(0, CKPT_KEEP), keep = [];
    let used = 0;
    for (const d of days) { const len = g.ckpt.get(d).length; if (keep.length && used + len > CKPT_BUDGET) break; keep.push(d); used += len; }
    let changed = false;
    for (const d of keep) {
      if (this.ckDays.has(d) || this.ckSkip.has(d)) continue;
      if (kv.setRaw('ck.' + d, g.ckpt.get(d))) { this.ckDays.add(d); changed = true; } else this.ckSkip.add(d); // storage is full: do not try this day again every quarter second
    }
    for (const d of [...this.ckDays]) if (!keep.includes(d)) { kv.del('ck.' + d); this.ckDays.delete(d); changed = true; }
    if (changed) kv.set('ckdays', { pid: g.s.pid, seed: g.s.seed, days: [...this.ckDays] });
  }
  _loadCkpt(state) {
    const rec = kv.get('ckdays');
    this.ckDays = new Set();
    if (!rec || rec.pid !== state.pid || rec.seed !== state.seed || !Array.isArray(rec.days)) return;
    for (const d of rec.days) {
      const raw = Number.isInteger(d) && d >= 0 && d <= Math.floor(state.hour / 24) ? kv.getRaw('ck.' + d) : null;
      if (typeof raw === 'string' && raw[0] === '{') { this.game.ckpt.set(d, raw); this.ckDays.add(d); }
    }
  }
  _clearCkpt() {
    const rec = kv.get('ckdays');
    for (const d of new Set([...this.ckDays, ...(Array.isArray(rec?.days) ? rec.days : [])])) kv.del('ck.' + d);
    kv.del('ckdays'); this.ckDays = new Set(); this.ckSkip = new Set();
  }

  // ---- the instructor's roster survives a reload of the dashboard
  _saveRoster(wall) {
    if (!this.rosterDirty || !this.roomInfo || wall - this.t.roster < 10000) return;
    this.t.roster = wall; this.rosterDirty = false;
    const peers = [...this.peers.values()].filter((p) => p.role === 'student' && p.snap).map((p) => ({ pid: p.pid, handle: p.handle, seen: p.seen, snap: { ...p.snap, inventory: [] } }));
    kv.set('roster', { code: this.roomInfo.code, peers, shocks: [...this.injected] });
  }
  _loadRoster(code) {
    const r = kv.get('roster');
    if (!isObj(r) || r.code !== code || !Array.isArray(r.peers)) return;
    if (Array.isArray(r.shocks)) for (const e of r.shocks.slice(0, 200)) if (Array.isArray(e)) this._noteShock(e[0], e[1]); // the shocks this instructor sent survive a reload of the dashboard
    for (const e of r.peers.slice(0, MAX_PEERS)) {
      const pid = isObj(e) && peerId(e.pid), snap = pid && cleanSnap(e.snap, pid);
      if (snap) this.peers.set(pid, { pid, handle: text(e.handle), role: 'student', snap, clean: true, seen: num(e.seen, 0, Date.now(), 0) });
    }
  }

  // ---- the loop
  tick(wall = Date.now()) {
    if (this.mode === 'instructor') {
      if (this.recovering && wall - this.joinedAt > RECOVER_WAIT_MS) { // nobody stood in for us: the hour the class's snapshots show, paused, for the instructor to start when ready
        const hs = [...this.peers.values()].filter((p) => p.role === 'student' && p.snap && Number.isFinite(p.snap.hour)).map((p) => p.snap.hour);
        this._recovered(hs.length ? median(hs) : 0, 1, true);
      }
      if (wall - this.t.clock > 4000) this._sendClock();
      if (this.cohortDirty && wall - this.t.cohort >= COHORT_MS) this._flushCohort();
      this._saveRoster(wall);
      this.emit('tick');
      return;
    }
    const g = this.game;
    if (!g) return;
    // nobody answered (no instructor, no other student): run on the clock this machine has
    if (this.mode === 'student' && this.room && !this.clockAdopted && wall - this.joinedAt > CLOCK_WAIT_MS) { this.clockAdopted = true; this.clock.set({ hour: g.s.hour, paused: false, speed: 1 }); }
    const target = this.clock.now(wall);
    const before = g.s.hour;
    if (this.mode === 'student' && this.clockAdopted && !this.clock.paused && wall - this.t.clock > 8000 && this.room && wall - this.instructorSeen > 20000 && this.leaderPid() === this.pid) { this.t.clock = wall; this.room.send({ t: 'clock', hour: target, speed: this.clock.speed, paused: this.clock.paused }); }
    this._lapseLocks(wall);
    if (target > g.s.hour) g.advanceTo(target);
    for (const m of g.out.splice(0)) this._deliver(m);
    if (this.room) this._sendSnap(false);
    if (this.cohortDirty && wall - this.t.cohort >= COHORT_MS) this._flushCohort();
    for (const [id, p] of this.accepting) if (wall - p.at > ACCEPT_WAIT_MS) { this.accepting.delete(id); g.note('warn', `${p.name} did not confirm in time. Nothing changed hands.`); }
    for (const [id, d] of this.delivering) { // committed, and no word yet that the proposer took the delivery: say it again (the proposer answers a repeat the same way), quickly at first and then every half minute
      const age = wall - d.at, due = d.tries < DELIVER_TRIES ? age >= DELIVER_RETRY_MS * d.tries * d.tries : wall - (d.last ?? d.at) >= DELIVER_SLOW_MS;
      if (!due) continue;
      if (age > DELIVER_HOLD_MS) { this.delivering.delete(id); g.note('warn', `${d.name} has not said the swap arrived. If it did not, ask them to check the offer: what you gave is already with them.`); continue; }
      d.tries++; d.last = wall; this._tell(d.to, 'deliver', d.payload);
    }
    if (this.mode === 'student') this._persistCkpt();
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
    const out = this.alivePeers(45000).filter((p) => p.role === 'student' && p.snap && p.pid !== this.pid).map((p) => ({ pid: p.snap.pid, handle: p.snap.handle, perks: p.snap.perks, skills: p.snap.skills, inventory: p.snap.inventory || [], nw: p.snap.nw }));
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
  /** The crates a new proposal asks for, plus those already asked for in offers still open, must fit the district (the engine alone counts only the new proposal). */
  _noRoomFor(args) {
    const g = this.game, s = g.s, open = [...s.zones].sort((x, y) => y - x);
    const homeOf = (z) => (s.zones.includes(z) ? z : open.find((o) => o <= z) ?? open[open.length - 1]);
    const asked = {}, leaving = {}, bump = (o, z) => { o[z] = (o[z] || 0) + 1; };
    for (const w of args.want?.assets || []) bump(asked, homeOf(w.zone));
    for (const id of args.giveIds || []) { const a = s.assets.find((x) => x.id === id); if (a) bump(leaving, a.zone); }
    for (const { offer } of this.sent.values()) { for (const w of offer.want.assets) bump(asked, homeOf(w.zone)); for (const a of offer.give.assets) bump(leaving, a.zone); }
    for (const z of Object.keys(asked)) if (asked[z] - (leaving[z] || 0) > g.roomIn(+z)) return `You would have no room in ${ZONES[z].short} for everything you have asked for.`;
    return null;
  }
  propose(args) {
    const g = this.game, to = cleanId(args?.to);
    if (!g) return { ok: false, msg: 'Start a run first.' };
    if (!to) return { ok: false, msg: 'Choose someone to trade with.' };
    if (to === this.pid) return { ok: false, msg: 'You cannot trade with yourself.' };
    const isNpc = to === this.npc.id;
    if (!isNpc && !this.peers.has(to)) return { ok: false, msg: 'That classmate is not in your room.' };
    const crowded = this._noRoomFor(args);
    if (crowded) { this.emit('change'); return { ok: false, msg: crowded }; }
    // The classmate checks the offer against the stock this founder has published, and the crates in an offer leave the stock the moment it is made: so the stock is published first, with those crates in it.
    if (!isNpc && Array.isArray(args?.giveIds) && args.giveIds.length) this._sendSnap(true, args.giveIds);
    const r = g.createOffer(args);
    if (!r.ok) { this.emit('change'); return r; }
    const offer = r.offer;
    this.sent.set(offer.id, { offer, at: Date.now() });
    if (isNpc) setTimeout(() => this._npcRespond(offer), 2500);
    else this.room?.send({ t: 'offer', to, offer });
    this.emit('change');
    return r;
  }
  /** The practice partner is a teaching aid that cannot lose: it gives no more than it gets, never pays cash for cash or against a promise, pays out only what its shelves are worth in a day, and pays no experience. */
  _npcJudge(offer) {
    const g = this.game, inv = this.npcView().inventory, no = (why) => ({ ok: false, why });
    const byId = new Map(inv.map((a) => [a.id, a])), asked = [];
    for (const w of offer.want.assets) { const a = byId.get(w.id); if (!a || asked.includes(a)) return no('they do not hold what you asked for.'); asked.push(a); }
    const cash = Math.max(0, +offer.want.cash || 0);
    if (!asked.length && !(cash > 0)) return no('there is nothing on their side of this deal.');
    if (!offer.give.assets.length && !asked.length) return no('cash for cash is no swap. Ask for a crate.');
    if (cash > 0 && offer.give.royalty) return no('they do not pay cash against a promise. Offer a crate or cash.');
    const va = g.sideValue(offer.give), vb = g.sideValue({ assets: asked, cash }); // what they get, and what they give by their own shelves, both priced as the fair-value check prices
    if (vb > va * 1.02 + 0.01) return no(`they will not give more than they get (${usd(vb)} for ${usd(va)}).`);
    const variance = fmvVariance(va, vb);
    if (variance > 0.3) return no(`they want a deal within 30% of fair value (yours was ${(variance * 100).toFixed(0)}% off).`);
    const purse = g.sideValue({ assets: inv }), paid = this.npc.paid.day === g.day ? this.npc.paid.cash : 0;
    if (cash > 0 && paid + cash > purse) return no('they have paid out all they can for today. Try again tomorrow.');
    const need = {}, free = {};
    for (const a of asked) need[a.zone] = (need[a.zone] || 0) + 1;
    for (const a of offer.give.assets) free[a.zone] = (free[a.zone] || 0) + 1;
    for (const z of Object.keys(need)) if (need[z] - (free[z] || 0) > g.roomIn(+z)) return no(`you would have no room in ${ZONES[z].short}.`);
    return { ok: true, delivery: { assets: asked.map((a) => ({ id: a.id, cls: a.cls, cond: a.cond, quality: a.quality, wear: a.wear, zone: a.zone, known: true })), cash }, paid: { day: g.day, cash: paid + cash } };
  }
  _npcRespond(offer) {
    const g = this.game, id = offer?.id;
    this.sent.delete(id);
    const e = g && g.s.escrow.find((x) => x.offerId === id);
    if (!e) return;
    const v = this._npcJudge(e.offer);
    if (v.ok) {
      // A swap with the partner teaches the mechanics and pays nothing: no experience, no swap counted. The engine is told ({ npc: true }, shared contract c);
      // whatever it still credited is taken back, so the guarantee does not depend on which engine this session is joined to.
      const s = g.s, before = { xp: s.xp, p2p: s.p2p, trades: s.trades, lvlPaid: s.lvlPaid, points: s.points };
      const fin = g.finalizeOffer(id, v.delivery, this.npc.handle, { npc: true });
      if (fin.ok) { Object.assign(g.s, before); this.npc.paid = v.paid; }
      g.note(fin.ok ? 'good' : 'bad', fin.ok ? 'Practice Partner accepted your swap.' : fin.msg);
    } else {
      g.cancelOffer(id);
      g.note('info', `Practice Partner declined: ${v.why}`);
    }
    this.emit('change');
  }
  /** An invitation's `want` side as it really is: the crates this founder holds, by id, valued by the engine. Null if any is gone. */
  _ownWant(o) {
    const g = this.game, out = [], seen = new Set();
    for (const w of o.want.assets) {
      const a = g.s.assets.find((x) => x.id === w.id);
      if (!a || seen.has(a.id) || (w.cls && w.cls !== a.cls)) return null;
      seen.add(a.id); out.push(g.pub(a));
    }
    return out;
  }
  _onOffer(m, from) {
    const g = this.game;
    if (!g || m.to !== this.pid) return;
    const o = cleanOffer(m.offer, from, this.pid);
    if (!o || this.incoming.some((x) => x.offer.id === o.id) || this.accepting.has(o.id)) return; // not an offer, or one already seen
    if (this.incoming.length >= MAX_INCOMING || this.incoming.filter((x) => x.offer.from === from).length >= MAX_INCOMING_PER) return;
    const want = this._ownWant(o);
    if (!want) { this._tell(from, 'decline', { offerId: o.id }); return; } // it asks for something we do not hold: say so now, their escrow comes back
    o.want.assets = want;
    // a royalty is a promise from the proposer, and it is worth what they are worth: the number they published to the room in their snapshot, not the one written in the offer (which is theirs to make up)
    const snapNw = this.peers.get(from)?.snap?.nw;
    if (typeof snapNw === 'number' && Number.isFinite(snapNw)) { const known = Math.min(snapNw, nwCeiling(this.hourNow())); o.nw = o.nw === undefined ? known : Math.min(o.nw, known); } else delete o.nw; // (and no founder is worth more than the best run of this day could be)
    // A royalty a day bigger than the promiser's whole worth is not a promise that can be kept; and the crates an offer describes must be crates the sender has published (see _publishedCovers). Either is answered
    // as an offer for something we do not hold is: declined, so an honest proposer's escrow comes back.
    const pub = this.peers.get(from)?.snap;
    if (o.give.royalty && o.nw !== undefined && o.give.royalty.perDay > Math.max(1, o.nw)) { this._tell(from, 'decline', { offerId: o.id }); return; }
    if (!this._publishedCovers(pub, o.give.assets, o.nw)) { this._tell(from, 'decline', { offerId: o.id }); return; }
    const handle = text(m.handle) || o.fromHandle;
    this.incoming.push({ offer: o, at: Date.now(), handle, from });
    this.emit('offer', o);
    g.note('info', `${handle || 'A classmate'} proposed a swap. Open Market, then Exchange, to review it.`);
  }
  /** Does what the sender published say they hold these crates? Every crate an offer describes must be in the stock the sender last published (the same id, class and condition), and together they cannot be worth
   *  more than the sender is allowed to be (their published net worth, cut to the best a run could be on this day, and their debt: the crates are bought with it). A hand-built offer for a crate nobody holds
   *  is not an offer. The stock is the sender's own word too, so this is a bound and not a proof (the two-sided cross-check in docs/ARCHITECTURE.md is the proof); it makes a made-up crate something the whole room
   *  can see in the roster, and bounds it by the worth the sender can claim. */
  _publishedCovers(snap, assets, nw) {
    if (!assets.length) return true;
    const stock = snap && Array.isArray(snap.inventory) ? snap.inventory : null;
    if (!stock) return false;
    const byId = new Map(stock.map((a) => [a.id, a]));
    for (const a of assets) { const p = byId.get(a.id); if (!p || p.cls !== a.cls || p.cond !== a.cond) return false; }
    const worth = this.game.sideValue({ assets }), allowed = (Math.max(0, nw ?? 0) + (snap.debt || 0)) * 1.5 + 5;
    return worth <= allowed;
  }
  /** Step one, taken by the acceptor: nothing leaves its hands. It asks the proposer to confirm it still holds the escrow. */
  acceptIncoming(offerId) {
    const g = this.game, i = this.incoming.find((x) => x.offer.id === offerId);
    if (!i) return { ok: false, msg: 'That offer expired.' };
    const offer = { ...i.offer, want: { ...i.offer.want, assets: this._ownWant(i.offer) } };
    if (!offer.want.assets) return { ok: false, msg: 'You no longer hold the asset they asked for.' };
    const chk = g.checkOffer(offer);
    if (!chk.ok) return { ok: false, msg: `Blocked: ${(chk.variance * 100).toFixed(0)}% off fair market value.`, chk };
    if (offer.want.cash > g.s.cash) return { ok: false, msg: 'You do not have the cash they asked for.' };
    const name = i.handle || i.offer.from;
    this.accepting.set(offerId, { offer, from: i.offer.from, name, at: Date.now() });
    this.incoming = this.incoming.filter((x) => x !== i);
    this._tell(i.offer.from, 'accept', { offerId, handle: this.handle });
    this.emit('change');
    return { ok: true, msg: `Accepted. Waiting for ${name} to confirm; nothing changes hands until they do.` };
  }
  /** Step one, received by the proposer: it must still hold the escrow. If so it is held for this classmate (it cannot be withdrawn or expire under them) and they are told to go ahead. */
  _onAccept(m, from) {
    const g = this.game, id = cleanId(m.offerId), s = id && this.sent.get(id);
    if (!g || m.to !== this.pid || !id) return;
    if (!s) { this._tell(from, 'reject', { offerId: id, msg: 'That offer is no longer open.' }); return; } // withdrawn, expired, rewound or never made: they need not wait
    if (s.offer.to !== from) return; // only the classmate the offer was made to
    const e = g.s.escrow.find((x) => x.offerId === id);
    if (!e || g.s.over || g.s.exiting) { this.sent.delete(id); this._tell(from, 'reject', { offerId: id, msg: 'That offer is no longer open.' }); return; }
    // The escrow is held for this classmate ONCE per try: said again while it is held, it only repeats the confirmation; and an offer is held at most twice in all (a lost reply, one more try). Held again and again
    // with a fresh clock each time, it could be kept out of its owner's hands for the whole run, and their cash with it.
    if (e.lockedBy === from && !e.lockLapsed) { this._tell(from, 'confirm', { offerId: id }); return; }
    if ((e.locks || 0) >= MAX_LOCKS) { this._tell(from, 'reject', { offerId: id, msg: 'That offer is no longer open.' }); return; }
    e.lockedBy = from; e.lockedAt = Date.now(); e.locks = (e.locks || 0) + 1; delete e.lockLapsed; delete e.recalling;
    this._tell(from, 'confirm', { offerId: id });
  }
  /** A hold nobody delivered into within LOCK_MS ends, but not on a guess: the acceptor is asked whether it committed (`recall`), and until it answers (or RECALL_WAIT_MS has gone by) the escrow is still held, so the
   *  owner may not withdraw, the engine may not expire the offer and the business may not be sold under it. Once the hold has lapsed the owner may withdraw and the engine may expire the offer. (A late delivery is
   *  still taken while the escrow stands.) With no room to ask, or after the acceptor has renewed the hold MAX_HOLDS times, it lapses at once. */
  _lapseLocks(wall) {
    for (const e of this.game.s.escrow) {
      if (!e.lockedBy || e.lockLapsed) continue;
      if (e.recalling) { if (wall - e.recalling > RECALL_WAIT_MS) { e.lockLapsed = true; delete e.recalling; } continue; } // nobody answered: they are out of reach
      if (wall - (e.lockedAt || 0) <= LOCK_MS) continue;
      if (!this.room || (e.holds || 0) >= MAX_HOLDS) { e.lockLapsed = true; continue; }
      e.recalling = wall; this._tell(e.lockedBy, 'recall', { offerId: e.offerId });
    }
  }
  /** Received by the acceptor: the proposer's hold ran out and it asks whether we committed. We did if the swap is in `delivering` (it is there until the proposer has said it took the delivery): say so, and send the
   *  delivery again at once, so the hold is renewed and the swap completes. Otherwise we have not and will not: forget the offer, so a confirmation that comes late finds nothing to commit to, and say we are free. */
  _onRecall(m, from) {
    const id = cleanId(m.offerId);
    if (!this.game || !id || m.to !== this.pid) return;
    const d = this.delivering.get(id);
    if (d && d.to === from) { d.last = Date.now(); this._tell(from, 'holding', { offerId: id }); this._tell(from, 'deliver', d.payload); return; }
    this.incoming = this.incoming.filter((x) => !(x.offer.id === id && x.offer.from === from));
    const p = this.accepting.get(id); if (p && p.from === from) this.accepting.delete(id);
    this._tell(from, 'free', { offerId: id });
    this.emit('change');
  }
  /** Received by the proposer, from the classmate its hold was for, in answer to a recall: they have committed and the delivery is coming, so the hold starts again. */
  _onHolding(m, from) {
    const g = this.game, id = cleanId(m.offerId), e = id && g?.s.escrow.find((x) => x.offerId === id);
    if (!e || m.to !== this.pid || e.lockedBy !== from || !e.recalling) return;
    delete e.recalling; e.lockedAt = Date.now() + RENEW_MS - LOCK_MS; e.holds = (e.holds || 0) + 1; // (the next lapse is RENEW_MS from now)
    g.note('info', `${this.peers.get(from)?.handle || 'Your counterparty'} has already sent their side. It is on its way, so your offer stays held.`);
    this.emit('change');
  }
  /** Received by the proposer, in answer to a recall: they never committed, so nothing of theirs is on its way. The hold is let go and the offer is open again (the owner may withdraw it). */
  _onFree(m, from) {
    const g = this.game, id = cleanId(m.offerId), e = id && g?.s.escrow.find((x) => x.offerId === id);
    if (!e || m.to !== this.pid || e.lockedBy !== from || !e.recalling) return;
    delete e.lockedBy; delete e.lockedAt; delete e.recalling; delete e.lockLapsed;
    g.note('info', `${this.peers.get(from)?.handle || 'Your counterparty'} had not accepted the swap. Your offer is open again.`);
    this.emit('change');
  }
  /** Step two, received by the acceptor: the proposer is committed, so the acceptor commits and hands its side over. */
  _onConfirm(m, from) {
    const g = this.game, id = cleanId(m.offerId), p = id && this.accepting.get(id);
    if (!g || m.to !== this.pid || !p || p.from !== from) return;
    this.accepting.delete(id);
    // The proposer holds its escrow for LOCK_MS; this side waits ACCEPT_WAIT_MS. A confirmation that arrives after the wait (a stalled link, a background tab that was throttled and whose sweep has not run) is stale:
    // committing on it could outlive the proposer's hold, and the proposer, having withdrawn, would find nothing to settle. So the wait is enforced here, not only by the sweep.
    if (Date.now() - p.at > ACCEPT_WAIT_MS) {
      this._tell(from, 'abort', { offerId: id });
      g.note('warn', `${p.name} did not confirm in time. Nothing changed hands.`);
      this.emit('change');
      return;
    }
    const held = this._ownWant(p.offer), offer = held && { ...p.offer, want: { ...p.offer.want, assets: held } };
    const r = offer ? g.acceptOffer(offer) : { ok: false, msg: 'You no longer hold the asset they asked for.' };
    if (!r.ok) {
      this._tell(from, 'abort', { offerId: id });
      g.note('bad', `${p.name}: ${r.msg} Nothing changed hands.`);
    } else {
      const payload = { offerId: id, deliver: { cash: r.deliver.cash, assets: r.deliver.assets.map((a) => cleanAsset(a, { fold: true })).filter(Boolean) }, handle: this.handle };
      this._tell(from, 'deliver', payload);
      this.delivering.set(id, { to: from, payload, at: Date.now(), last: Date.now(), tries: 1, name: p.name });
      g.note('good', `Swap completed with ${p.name}.`);
    }
    this.emit('change');
  }
  /** Step three, received by the proposer: only the classmate it held the escrow for, only once, and only as much as was asked. It answers `ack` to a delivery it took, and to one it took already (the acceptor sent it again). */
  _onDeliver(m, from) {
    const g = this.game, id = cleanId(m.offerId), s = id && this.sent.get(id), e = id && g?.s.escrow.find((x) => x.offerId === id);
    if (g && id && m.to === this.pid && !s && !e && this.settled.get(id) === from) { this._tell(from, 'ack', { offerId: id }); return; } // a repeat of a delivery already taken
    if (!g || m.to !== this.pid || !s || !e || s.offer.to !== from || e.lockedBy !== from) return;
    const want = e.offer.want, d = isObj(m.deliver) ? m.deliver : {}, given = Array.isArray(d.assets) ? d.assets : [], assets = [];
    for (const w of want.assets) {
      const c = cleanAsset(given.find((a) => isObj(a) && a.id === w.id), { fold: true });
      if (c && (!w.cls || c.cls === w.cls)) assets.push(c);
    }
    const cash = typeof d.cash === 'number' && Number.isFinite(d.cash) ? Math.min(Math.max(d.cash, 0), want.cash) : 0;
    const name = text(m.handle) || from;
    const r = g.finalizeOffer(id, { assets, cash }, name);
    if (r.ok) {
      this.sent.delete(id);
      this.settled.set(id, from); if (this.settled.size > MAX_SETTLED) this.settled.delete(this.settled.keys().next().value);
      this._tell(from, 'ack', { offerId: id });
    } else { delete e.lockedBy; delete e.lockedAt; delete e.lockLapsed; delete e.recalling; } // a reply that is not that swap changes nothing: the offer is open again, and the hold is let go
    const short = assets.length < want.assets.length || cash < want.cash - 0.005;
    g.note(r.ok ? (short ? 'warn' : 'good') : 'bad', r.ok ? (short ? `${name} delivered less than the swap said. What arrived was added.` : `${name} accepted. Swap completed.`) : r.msg);
    this.emit('change');
  }
  _onAbort(m, from) {
    const g = this.game, id = cleanId(m.offerId), e = id && g?.s.escrow.find((x) => x.offerId === id);
    if (!e || m.to !== this.pid || e.lockedBy !== from) return;
    delete e.lockedBy; delete e.lockedAt; delete e.lockLapsed; delete e.recalling;
    g.note('info', `${this.peers.get(from)?.handle || 'Your counterparty'} could not complete the swap. Your offer is still open.`);
    this.emit('change');
  }
  _onReject(m, from) {
    const g = this.game, id = cleanId(m.offerId), p = id && this.accepting.get(id);
    if (!g || m.to !== this.pid || !p || p.from !== from) return;
    this.accepting.delete(id);
    g.note('warn', `${p.name}: ${text(m.msg, 100).replace(/\.$/, '') || 'that offer is no longer open'}. Nothing changed hands.`);
    this.emit('change');
  }
  _onDecline(m, from) {
    const g = this.game, id = cleanId(m.offerId), s = id && this.sent.get(id);
    if (!g || m.to !== this.pid || !s || s.offer.to !== from) return;
    g.cancelOffer(id);
    this.sent.delete(id);
    g.note('info', `${text(m.handle) || 'Your counterparty'} declined. Your escrow was returned.`);
    this.emit('change');
  }
  _onRoyalty(m, from) {
    const g = this.game, id = cleanId(m.offer);
    if (!g || m.to !== this.pid || !id) return;
    const r = g.s.royalties.find((x) => x.dir === 'recv' && x.offer === id && x.peer === from); // a stream we really hold, from the one who owes it
    if (!r || typeof m.amount !== 'number' || !(m.amount > 0)) return;
    g.receiveRoyalty(m.amount, id, from, Math.floor(this.clock.now())); // the engine holds the caps (a day's rate a message, never more in all than was agreed and counted, never faster than the days go by: by the class's clock, which this game can trail) and books what it takes into r.got itself
  }
  _onFlag(m, from) {
    if (this.mode !== 'instructor' || m.role !== 'student' || !isObj(m.offer)) return;
    const o = m.offer;
    this.flags.push({ id: text(o.id, 48), from, to: text(o.to), variance: num(o.variance, 0, 9.99, 0), va: num(o.va, 0, 1e12, 0), vb: num(o.vb, 0, 1e12, 0), handle: text(m.handle), at: Date.now(), hour: Math.floor(this.clock.now()) });
    if (this.flags.length > MAX_FLAGS) this.flags.splice(0, this.flags.length - MAX_FLAGS);
    this.emit('flag');
  }
  declineIncoming(offerId) {
    const i = this.incoming.find((x) => x.offer.id === offerId);
    if (i) { this._tell(i.offer.from, 'decline', { offerId, handle: this.handle }); this.incoming = this.incoming.filter((x) => x !== i); }
    this.emit('change');
  }
  withdraw(offerId) {
    this._lapseLocks(Date.now()); // a hold that has run out is asked about now, not at the next tick
    const o = this.sent.get(offerId), e = this.game.s.escrow.find((x) => x.offerId === offerId);
    if (e?.lockedBy && !e.lockLapsed) return { ok: false, msg: e.recalling ? `Checking whether ${this.peers.get(e.lockedBy)?.handle || 'they'} already sent their side. Give it a moment.` : 'They are accepting this offer right now. Give it a moment.' };
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
    this._noteShock(id, at);
    this.room?.send({ t: 'inject', kind, atHour: at, id, replace, cls });
    this.emit('change');
  }
  setDifficulty(patch) { Object.assign(this.difficulty, cleanDifficulty(patch)); this._sendClock(); this.emit('change'); }
  setGhosts(n) { this.ghosts = Math.round(num(+n, 0, 200, this.ghosts)); this.cohort.ghosts = this.ghosts; this.cohort.refresh(); this._sendClock(); this.emit('change'); } // refresh: the heat map must not keep showing the old herd
  setAlgo(on) { this.algo = !!on; this._sendClock(); this.emit('change'); }
  rewind(days) {
    if (this.mode !== 'instructor') return;
    const to = Math.max(0, Math.floor(this.clock.now() / 24 - days) * 24);
    this.rewindReport.clear();
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

  // ---- the room's own record of its shocks
  /** Remember a shock the instructor injected (bounded: a room has a handful). */
  _noteShock(id, start) {
    if (typeof id !== 'string' || !id || id.length > 120 || !Number.isFinite(start) || this.injected.has(id)) return;
    if (this.injected.size >= 200) this.injected.delete(this.injected.keys().next().value);
    this.injected.set(id, start); this.rosterDirty = true;
  }
  /** The hour a shock of this id began, if this room really had it: a scheduled one (js/config.js EVENTS), an algorithmic one this room's seed rolls (the engine's own draw), or one its instructor injected.
   *  Null for any other id: a shock that never happened is not graded, whoever says it did. */
  shockStart(id) {
    if (typeof id !== 'string') return null;
    if (this.injected.has(id)) return this.injected.get(id);
    const at = id.indexOf('@'), kind = at > 0 ? id.slice(0, at) : '';
    if (kind && Object.prototype.hasOwnProperty.call(EVENTS, kind)) { const start = (EVENTS[kind].day - 1) * 24; return id === `${kind}@${start}` ? start : null; }
    const m = /^algo-(\d{1,2})$/.exec(id);
    if (m) { const day = +m[1]; return day >= 4 && day <= 86 && hash01(this.worldSeed + 'algo' + day) <= 0.14 ? (day - 1) * 24 + 8 : null; }
    return null;
  }

  // ---- views
  hourNow() { return this.game ? this.game.s.hour : this.clock.now(); }
  /** Every student we know about, as comparable snapshots: the ones online, the ones who have left (away, with their last snapshot), then the simulated class. */
  students() {
    const hour = this.mode === 'instructor' ? this.clock.now() : this.hourNow();
    const now = Date.now(), floor = num(this.difficulty.eeiFloor, 0.01, 1e9, EEI_FLOOR_DEFAULT);
    const rows = [];
    for (const p of this.peers.values()) {
      if (p.role !== 'student' || !p.snap) continue;
      if (!p.clean) { p.snap = cleanSnap(p.snap, p.pid); p.clean = true; if (!p.snap) continue; } // a snapshot placed here without passing the door
      const sn = p.snap, online = now - p.seen < ONLINE_MS, closed = sn.flags?.exited === true || sn.flags?.over === true;
      // WHEN this row is: a founder who is online and playing is at the class's hour (the clock is the class's), within a couple of days of lag, whatever hour they say they are at (a low one claims a bigger time bonus);
      // one who left, or whose run is over, is where their last snapshot says, never ahead of the class. And what they are worth is cut to what the best run could be by then (cohort.nwCeiling), so a made-up
      // figure is as good as the best honest one on that day and no better. (The server tally in docs/ARCHITECTURE.md is the real fix; this narrows the lie.)
      const at = online && !closed ? clamp(sn.hour, hour - 48, hour + 48) : Math.min(sn.hour, hour + 48);
      const nw = Math.min(sn.nw, nwCeiling(at));
      const p2p = Math.min(sn.p2p || 0, SWAPS.perDay * (Math.floor(at / 24) + 1));
      // the score is recomputed from the numbers, never taken from the sender: not even for a run that has exited (the flag is the sender's too). An honest exit froze its hour and its net worth, so the same
      // formula gives the score it locked; a made-up one can only be as good as the net worth it reports, which is bounded above.
      const eei = eeiCalc(nw, sn.startCap, TOTAL_DAYS - at / 24, floor);
      rows.push({ ...sn, nw, p2p, eei, at, seen: p.seen, online, rewind: this.rewindReport.get(p.pid) || null });
    }
    const mine = this.game && this.mode !== 'instructor' ? [{ ...this.game.publicSnapshot(), me: true, online: true }] : [];
    const syn = this.synth.map((s) => { const sn = synthSnapshot(s, hour); sn.eei = eeiCalc(sn.nw, sn.startCap, TOTAL_DAYS - hour / 24, floor); sn.online = true; return sn; });
    return [...mine, ...rows.filter((r) => !mine.length || r.pid !== mine[0].pid), ...syn];
  }
  leaderboard() {
    const key = (x) => (Number.isFinite(x.eei) ? x.eei : -Infinity);
    const rows = this.students().sort((a, b) => key(b) - key(a));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  flagsAll() { return this.demo ? [...this.flags, ...synthFlags(this.synth, this.clock.now()).map((f) => ({ ...f, synth: true }))] : this.flags; }

  /** A student's shock rows as the grade may use them: only shocks this room really had (see shockStart), the first row for an id, a net worth no honest run could not reach by then dropped (the same envelope as the
   *  leaderboard's), and the net worth five days after counted only once the founder's own hour has got there. What a classmate's snapshot says about a shock is their word; this keeps it to what could be true. */
  _shocksOf(r) {
    const at = Number.isFinite(r.at) ? r.at : Number.isFinite(r.hour) ? r.hour : 0, seen = new Set(), out = [];
    for (const x of Array.isArray(r.shockLog) ? r.shockLog : []) {
      if (!x || seen.has(x.id)) continue;
      seen.add(x.id);
      const start = this.shockStart(x.id);
      if (start == null || !(x.nw <= nwCeiling(start))) continue;
      const done = x.nwAfter != null && at >= start + 120 && x.nwAfter <= nwCeiling(start + 120);
      out.push({ id: x.id, nw: x.nw, nwAfter: done ? x.nwAfter : null, pivots: x.pivots });
    }
    return out;
  }
  /** Pre-fills the LMS gradebook: 30% economic (percentile among all players: everyone starts with one paperclip, so no start is compared separately), 20% adaptability, 10% engagement. 40% reflection is the instructor's. */
  gradebook() {
    const rows = this.students();
    const med = new Map(); // (a Map: an id is text a classmate chose)
    // a founder wiped out after a shock has a ratio of ~0 (or below): it scores zero adaptability, it does not make the log (and the grade) NaN
    const ratio = (s) => clamp(s.nwAfter / s.nw, 0.001, 20); // and a founder who "grew twenty-fold" is believed no further: an unbounded ratio let one made-up shock row set the whole class's median
    // one pass over every row (each shock id keeps the ratios of the rows that logged it, the first entry of a row for an id): the dashboard asks about once a second, and a table of unique ids
    // used to be searched once per id and per row. Only the shocks the room really had are in it (_shocksOf).
    const byId = new Map(), shocksOf = new Map();
    for (const r of rows) {
      const mine = this._shocksOf(r);
      shocksOf.set(r, mine);
      for (const s of mine) if (s.nwAfter != null && s.nw > 0) { const list = byId.get(s.id); if (list) list.push(ratio(s)); else byId.set(s.id, [ratio(s)]); }
    }
    for (const [id, ratios] of byId) med.set(id, median(ratios));
    // A row is believed for a shock only if the class shows it was possible: at least SHOCK_QUORUM founders logged that shock (a class smaller than that, all of them), and what it claims is not far beyond what the class
    // itself got (SHOCK_BEYOND times the median). A made-up row for a shock that really happened ("a net worth of a cent, twenty times that five days later") used to score a full 100 against honest founders at 35 to 57.
    // (A claim inside the class's range is the founder's word, as every number of a snapshot is: the server tally in docs/ARCHITECTURE.md is the proof.)
    const quorum = Math.min(SHOCK_QUORUM, rows.length);
    const believed = (s) => byId.get(s.id)?.length >= quorum && ratio(s) <= med.get(s.id) * SHOCK_BEYOND;
    const flags = this.flagsAll();
    return rows.map((r) => {
      const below = rows.filter((x) => x.eei < r.eei).length;
      const econ = rows.length > 1 ? (below / (rows.length - 1)) * 100 : 50;
      const shocks = shocksOf.get(r).filter((s) => s.nwAfter != null && s.nw > 0 && med.get(s.id) > 0 && believed(s));
      const adapt = shocks.length ? shocks.reduce((a, s) => a + clamp(50 + 50 * Math.tanh(Math.log(ratio(s) / med.get(s.id)) * 3) + (s.pivots > 0 ? 10 : 0), 0, 100), 0) / shocks.length : null;
      const flagged = flags.filter((f) => f.from === r.pid).length;
      const engage = clamp((r.p2p || 0) * 25 - flagged * 10, 0, 100);
      const auto = econ * 0.3 + (adapt ?? 50) * 0.2 + engage * 0.1;
      return { ...r, econ, adapt, engage, flagged, auto, autoMax: 60 };
    });
  }
}
