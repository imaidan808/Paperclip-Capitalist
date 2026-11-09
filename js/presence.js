// Presence: who is in a room, where, and what just happened (docs/ARCHITECTURE.md, "Presence (relay version 2)"). Pure: no DOM, no network, no storage, no clock of its own (one is handed in), and nothing of the game.
// Lazy: the session loads it when a room with a relay is joined, so it is not part of the first screen.
//
// Presence is not the game. What a classmate says about where they are, and what they say they just did, is shown and never believed into a number: the engine, the market, the cohort, the deal room, the skill games and the
// meta layer do not import this module (tests/presence.test.mjs, U9), and it imports only the config, for the words a district and a shock go by. Everything that arrives from a room is untrusted (the relay checked it, and it is
// checked again here, as js/cohort.js checks a snapshot): a frame that does not pass is no news, and no frame can make `apply` throw.
import { ZONES, ZONE_COUNT, EVENTS, ALGO_EVENTS } from './config.js';

const MAX_MEMBERS = 450;   // a relay room holds 400 connections (server/relay.mjs) and the instructor's: a table is never longer than a room
const MAX_FEED = 100;      // the feed keeps the last of what happened
const STATE = /^[a-z]{1,12}$/, KIND = /^[a-z0-9_-]{1,16}$/, ID = /^[\w.@:-]{1,48}$/;
// Control, zero-width and direction-changing characters: no part of an alias or a note. Written as code points, not as escapes, so that nothing that handles this file can turn them into the characters themselves.
const UNSEEN = new RegExp('[' + [[0, 0x1f], [0x7f, 0x9f], [0x61c], [0x200b], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060], [0x2066, 0x2069], [0xfeff]].map(([a, b]) => String.fromCodePoint(a) + (b ? '-' + String.fromCodePoint(b) : '')).join('') + ']', 'g');
/** Text as a person typed it, made safe to show: no unseen characters, trimmed, at most `n` characters (counted as characters, so an emoji is never cut in half). Anything that is not text is no text. */
const plain = (x, n) => (typeof x === 'string' ? Array.from(x.replace(UNSEEN, '').trim()).slice(0, n).join('').trimEnd() : '');
const finite = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** A `here` as the room says it, checked again: a whole district number (0 is none: not in the world), a state word and the alias; or null. Nothing else of what was sent is kept. */
export function cleanHere(m) {
  if (!isObj(m) || !Number.isInteger(m.z) || m.z < 0 || m.z > 99 || typeof m.s !== 'string' || !STATE.test(m.s)) return null;
  return { z: m.z, s: m.s, handle: plain(m.handle, 24) };
}
/** An `act` as the room says it, checked again: a kind word, and optionally a value (a loss is negative), the game hour and a short note; or null. A value or an hour that is given and is not a sensible number makes it null. */
export function cleanAct(m) {
  if (!isObj(m) || typeof m.k !== 'string' || !KIND.test(m.k)) return null;
  const o = { k: m.k };
  if (m.v != null) { if (!finite(m.v, -1e12, 1e12)) return null; o.v = m.v; }
  if (m.h != null) { if (!finite(m.h, 0, 3000)) return null; o.h = m.h; }
  const d = plain(m.d, 48); if (d) o.d = d;
  o.handle = plain(m.handle, 24);
  return o;
}

/** What a student reports of what the engine just did: the line for an `act`, or null when the event is not news for the instructor. The hour is the game's, whole and within what the relay takes. */
const REPORT = {
  zone: (e) => ({ k: 'zone', v: e.id }),
  shock: (e) => ({ k: 'shock', d: e.kind }),
  milestone: (e) => ({ k: 'milestone', v: e.n }),
  insolvent: () => ({ k: 'insolvent' }),
  exit: (e) => ({ k: 'exit', d: e.kind }),
};
export function actOf(evt, hour) {
  if (!isObj(evt) || typeof evt.type !== 'string' || !Object.hasOwn(REPORT, evt.type)) return null;
  const a = REPORT[evt.type](evt);
  if (Number.isFinite(hour)) a.h = Math.max(0, Math.min(3000, Math.floor(hour)));
  return a;
}

const shockName = (kind) => (typeof kind === 'string' && Object.hasOwn(EVENTS, kind) ? EVENTS[kind].name : typeof kind === 'string' && Object.hasOwn(ALGO_EVENTS, kind) ? ALGO_EVENTS[kind].name : '');
/** An `act` in words. A district is named from its number and a shock from its kind by this page's own tables, never from the sender's text; a note (a classmate's alias in a swap) is the sender's, cleaned. */
export function describeAct(a) {
  const k = a && typeof a.k === 'string' ? a.k : '';
  switch (k) {
    case 'zone': return 'opened ' + (Number.isInteger(a.v) && Object.hasOwn(ZONES, a.v) ? ZONES[a.v].name : 'a new district');
    case 'swap': return 'swapped with ' + (a.d || 'a classmate');
    case 'shock': return shockName(a.d) ? 'felt a shock: ' + shockName(a.d) : 'felt a market shock';
    case 'milestone': return Number.isInteger(a.v) && a.v >= 1 && a.v <= 3 ? `reached milestone ${a.v}` : 'reached a milestone';
    case 'insolvent': return 'went insolvent';
    case 'exit': return a.d === 'ipo' ? 'launched an IPO' : a.d === 'trade' ? 'began a trade sale' : 'began an exit';
    default: return 'reported ' + k; // a kind that a newer page sends is shown by its word, not dropped
  }
}

/**
 * The table of a room: every member who has said hello or where they are, and the feed of what has happened. `now` is the clock (a function), handed in. `apply` takes what the session received (the relay's frame, with `from` and
 * `role` stamped, and `age` on what it replayed to a joiner) and returns null when it changed nothing, else { row }: the feed row it made, if it made one. A frame that carries an age is a replay of how the room stood and makes no
 * row (a dashboard opened late is not told that the whole class has just joined).
 */
export class Presence {
  constructor({ now, maxFeed = MAX_FEED, maxMembers = MAX_MEMBERS } = {}) {
    if (typeof now !== 'function') throw new TypeError('Presence needs a clock: new Presence({ now })');
    this.now = now; this.maxFeed = maxFeed; this.maxMembers = maxMembers;
    this.members = new Map(); // pid -> { pid, handle, role, online, z, s, seen, since, left }
    this.feed = [];           // newest first: { id, at, pid, handle, kind, text, v?, hour? }
    this.seq = 0;
  }
  actOf(evt, hour) { return actOf(evt, hour); }

  apply(m, from) {
    try { return this._apply(m, from); } catch { return null; } // nothing a room says may stop it
  }
  _apply(m, from) {
    if (!isObj(m) || typeof m.t !== 'string' || typeof from !== 'string' || !ID.test(from)) return null;
    const replay = typeof m.age === 'number', age = replay && Number.isFinite(m.age) ? Math.min(Math.max(m.age, 0), 6e5) : 0, now = this.now(), seen = now - age;
    const role = m.role === 'instructor' ? 'instructor' : 'student', had = this.members.get(from);
    if (m.t === 'bye') {
      if (!had || !had.online) return null;
      had.online = false; had.left = now; had.z = 0; had.s = '';
      return { row: !replay && had.role === 'student' ? this._row('left', had, 'left') : null };
    }
    if (m.t !== 'hello' && m.t !== 'here' && m.t !== 'act') return null;
    const c = m.t === 'here' ? cleanHere(m) : m.t === 'act' ? cleanAct(m) : null;
    if (m.t !== 'hello' && !c) return null;
    const mem = this._member(from, role);
    if (!mem) return null;
    const wasOnline = !!had && had.online;
    let changed = !had;
    const handle = (c ? c.handle : plain(m.handle, 24)) || '';
    if (handle && handle !== mem.handle) { mem.handle = handle; changed = true; }
    if (mem.role !== role) { mem.role = role; changed = true; }
    if (!wasOnline) { mem.online = true; changed = true; if (!had) mem.since = seen; }
    if (seen > mem.seen) mem.seen = seen;
    if (m.t === 'here' && (mem.z !== c.z || mem.s !== c.s)) { mem.z = c.z; mem.s = c.s; changed = true; }
    let row = null;
    if (m.t === 'act') row = this._row(c.k, mem, describeAct(c), c);
    else if (!replay && !wasOnline && role === 'student') row = this._row(had ? 'back' : 'joined', mem, had ? 'came back' : 'joined the room');
    return changed || row ? { row } : null;
  }
  /** The record of a member, made on first sight. A full table gives its place to the member who has been gone longest; when everyone is present, a newcomer is not taken. */
  _member(pid, role) {
    const have = this.members.get(pid);
    if (have) return have;
    if (this.members.size >= this.maxMembers) {
      let gone = null;
      for (const m of this.members.values()) if (!m.online && (!gone || m.left < gone.left)) gone = m;
      if (!gone) return null;
      this.members.delete(gone.pid);
    }
    const mem = { pid, handle: '', role, online: false, z: 0, s: '', seen: 0, since: 0, left: 0 };
    this.members.set(pid, mem);
    return mem;
  }
  _row(kind, mem, text, a) {
    const row = { id: ++this.seq, at: this.now(), pid: mem.pid, handle: (a && a.handle) || mem.handle, kind, text };
    if (a && a.v !== undefined) row.v = a.v;
    if (a && a.h !== undefined) row.hour = a.h;
    this.feed.unshift(row);
    if (this.feed.length > this.maxFeed) this.feed.length = this.maxFeed;
    return row;
  }

  /** Students online, by what they are doing and by district (only a student who is playing stands in one). Index 0 of `zones` is unused: districts are 1 to ZONE_COUNT. */
  counts() {
    const k = { here: 0, play: 0, academy: 0, away: 0, other: 0, zones: Array(ZONE_COUNT + 1).fill(0) };
    for (const m of this.members.values()) {
      if (m.role !== 'student' || !m.online) continue;
      k.here++;
      if (m.s === 'play') { k.play++; if (m.z >= 1 && m.z <= ZONE_COUNT) k.zones[m.z]++; } else if (m.s === 'academy') k.academy++; else if (m.s === 'away') k.away++; else k.other++;
    }
    return k;
  }
  /** The students, online first, then by alias. The instructor is not one. */
  list() {
    return [...this.members.values()].filter((m) => m.role === 'student').sort((a, b) => (b.online - a.online) || a.handle.localeCompare(b.handle) || (a.pid < b.pid ? -1 : 1));
  }
}
