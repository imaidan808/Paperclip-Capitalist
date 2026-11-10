// Minimal classroom relay: forwards JSON messages between everyone in a room and replays the last
// snapshot per connected founder (and the last clock) to late joiners. It keeps nothing on disk and never logs payloads.
//   cd server && npm install && npm start      (PORT=8787 by default; PORT=0 picks a free one and says which)
//
// It is the one process every class shares, so it trusts nobody and must not fall over:
//  - every socket has an error handler, a message rate and a size limit; a frame that is binary, oversize, not JSON or of an unknown type is dropped (and counts against the rate, so a flood of any of them ends the connection);
//  - `from` and `role` are stamped by the relay from the connection, never taken from the message. The first connection to claim the instructor's seat in a
//    room holds it, and its pid (with its key, below) can always take it back from anyone; no other pid is ever handed it while the room lives (a timer was: a laptop lid closed for a break and a student was the instructor,
//    with the real one locked out. An operator who wants a handover after a long absence sets SEAT_GRACE_MS). Only the instructor can send clock, inject or rewind;
//  - the way back for an instructor who has lost the browser's storage, or moves to another device, is the room's owner token (`owner`, below): a secret the instructor keeps a copy of;
//  - a pid is not an identity (every message carries the sender's, so every classmate knows everyone's): a connection must bring `key`, a secret its browser keeps beside the pid. The first connection
//    to use a pid in a room binds the pid to a hash of its key (nothing else is kept of it, and it is never logged), and a later connection for that pid with another key, or none, is refused. That is
//    what stops a classmate from taking the instructor's seat, or a classmate's name and snapshot, by connecting with the pid they have read off the wire;
//  - a message with a `to` goes to that founder alone, not to the whole room;
//  - presence is version 2, and opt-in (`&v=2` on the connection): a client that asks is welcomed with what the relay can do, and may say where it is (`here`) and, if it is a student, what it just did (`act`). Both are
//    rebuilt here from a whitelist, never passed on as sent, and rate limited a socket. A `here` goes to the room's other version 2 members, the last one of each connected member is kept (small, bounded, forgotten when the socket
//    closes) and replayed to a version 2 joiner with its age, and one that says what the last said is not sent again. The alias a `here` or an `act` carries is the one the member gave in its hello, whatever the frame says. The
//    instructor's switch (`presence` in its clock: full, online, off) is kept with the room: a student is told of the others in full, without their districts, or not at all, and the instructor's seat in full under all three.
//    An `act` goes to the instructor's seat alone, and is kept for nobody. A client that did not ask for
//    version 2 is sent none of it and cannot send it, so a class of old clients and new ones works, and so does a new client on a relay of before this change (it is never welcomed, so it never says anything);
//  - snapshots are kept only for sockets still connected, are size-capped, and are replayed with their age; rooms, clients, bytes are all bounded;
//  - a full room, or a full relay, gives its place to a newcomer by dropping what has said nothing for IDLE_MS (never the instructor's seat), so sockets that only sit there cannot keep a class out.
//
// `createRelay({ env, now, log })` builds one without starting it, so a test can run a relay in its own process with the clock it chooses; started as a program (`node relay.mjs`) it reads the environment and listens.
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TYPES = new Set(['hello', 'bye', 'snap', 'clock', 'inject', 'rewind', 'rewound', 'offer', 'accept', 'confirm', 'abort', 'reject', 'deliver', 'ack', 'decline', 'withdraw', 'recall', 'holding', 'free', 'royalty', 'flag', 'here', 'act']);
const INSTRUCTOR_ONLY = new Set(['clock', 'inject', 'rewind']);
const PRESENCE = new Set(['here', 'act']);
const PID = /^[A-Za-z0-9_.-]{1,24}$/;
const KEY = /^[A-Za-z0-9_-]{16,64}$/;
/** What a version 2 client is told when it connects. `caps` are the message types this relay takes from it (a client sends no presence the relay has not promised). */
const WELCOME = JSON.stringify({ t: 'welcome', v: 2, caps: ['here', 'act'] });
const STATE = /^[a-z]{1,12}$/;      // what a member is doing, as one word (`here.s`): the relay checks the shape, the clients know the words, so a new word needs no new relay
const KIND = /^[a-z0-9_-]{1,16}$/;  // what a student just did, as one word (`act.k`)
// Control, zero-width, direction-changing and blank-rendering characters (the fillers, the blank braille cell, the soft hyphen, the invisible operators, the tag characters): no part of an alias or a note. This is the client's list
// (js/presence.js, UNSEEN), kept equal to it by tests/presence-relay.test.mjs (P13): the relay is deployed on its own and cannot import the client. The joiners and the variation selectors stay, since an emoji sequence needs them;
// an alias of nothing else is none (below). Written as code points, not as escapes, so that nothing that handles this file can turn them into the invisible characters themselves (a pattern holding a line separator is not a pattern).
const UNSEEN = new RegExp('[' + [[0, 0x1f], [0x7f, 0x9f], [0xad], [0x34f], [0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180b, 0x180e], [0x200b], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0x2800], [0x3164], [0xfeff], [0xffa0], [0xe0000, 0xe007f]].map(([a, b]) => String.fromCodePoint(a) + (b ? '-' + String.fromCodePoint(b) : '')).join('') + ']', 'gu');
const JOINERS = new RegExp('^[' + String.fromCodePoint(0x200c) + String.fromCodePoint(0x200d) + String.fromCodePoint(0xfe00) + '-' + String.fromCodePoint(0xfe0f) + ']*$', 'u');
/** Text a person or a client wrote, as the relay passes it on: no unseen characters, trimmed, at most `n` characters (counted as characters, so an emoji is never cut in half). What has nothing left to see is none, and anything that is not text is no text. */
export const plain = (x, n) => {
  if (typeof x !== 'string') return '';
  const t = x.replace(UNSEEN, '').trim();
  return JOINERS.test(t) ? '' : Array.from(t).slice(0, n).join('').trimEnd();
};
const finite = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
/** A `here` as the relay will pass it on, or null: a whole district number (0 is none: not in the world), a state word and the alias. The alias is `name`, the one the member gave in its hello, never a word of this frame
 *  (one alias for one member, whatever its frames say). Nothing else of what was sent is kept. */
const hereOf = (m, name) => (Number.isInteger(m.z) && m.z >= 0 && m.z <= 99 && typeof m.s === 'string' && STATE.test(m.s) ? { t: 'here', z: m.z, s: m.s, handle: name } : null);
/** An `act` as the relay will pass it on, or null: a kind word, and optionally a value (a loss is negative), the game hour it happened at and a short note. A value or an hour that is given and is not a sensible number makes it null. */
function actOf(m, name) {
  if (typeof m.k !== 'string' || !KIND.test(m.k)) return null;
  const o = { t: 'act', k: m.k };
  if (m.v != null) { if (!finite(m.v, -1e12, 1e12)) return null; o.v = m.v; }
  if (m.h != null) { if (!finite(m.h, 0, 3000)) return null; o.h = m.h; }
  const d = plain(m.d, 48); if (d) o.d = d;
  o.handle = name;
  return o;
}

/** How deeply a frame nests its brackets, counted without parsing it (a real message nests a handful of levels; a frame that nests thousands is an attack on the code that walks it). Stops counting at `limit`. */
const nesting = (text, limit) => {
  let depth = 0, max = 0, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) { if (c === 92) i++; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true;
    else if (c === 91 || c === 123) { if (++depth > max) { max = depth; if (max > limit) return max; } }
    else if (c === 93 || c === 125) depth--;
  }
  return max;
};
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The limits a relay runs with, from an environment (a test passes its own; the program passes process.env). These defaults are what a class gets: tests/remaining-engine.test.mjs holds them. */
export function limitsOf(source = process.env) {
  const env = (k, d) => (source[k] != null && source[k] !== '' && Number.isFinite(+source[k]) ? +source[k] : d);
  return {
    PORT: env('PORT', 8787),
    MAX_ROOM: env('MAX_ROOM', 400),            // clients in one room
    MAX_ROOMS: env('MAX_ROOMS', 200),          // rooms on this relay
    MAX_MSG: env('MAX_MSG', 32 * 1024),        // any frame: a real message is a few KB
    MAX_SNAP: env('MAX_SNAP', 16 * 1024),      // a snapshot: a real one is about 3 KB
    MAX_SNAP_BYTES: env('MAX_SNAP_BYTES', 64 * 1024 * 1024), // all remembered snapshots on this relay
    RATE: env('RATE', 20), BURST: env('BURST', 60), // messages a second a socket may send, and how many at once
    PRES_RATE: env('PRES_RATE', 2), PRES_BURST: env('PRES_BURST', 10), // presence frames (`here`, `act`) a second a socket may send, and how many at once: a district changes now and then, a position is not sent
    MAX_PRES: env('MAX_PRES', 512),            // a presence frame: a real one is about 100 bytes
    MAX_HERE_BYTES: env('MAX_HERE_BYTES', 8 * 1024 * 1024), // all remembered `here` frames on this relay (a member's is about 100 bytes: this is the bound, not the use)
    SEAT_GRACE_MS: env('SEAT_GRACE_MS', 0),    // 0: never. How long the instructor's seat is held against a DIFFERENT pid once its holder is gone (the owner takes it back whatever this says)
    GHOST_MS: env('GHOST_MS', 30 * 1000),      // a pid that connected, never sent a snapshot and has been gone this long may be forgotten to make room for a new one
    EMPTY_MS: env('EMPTY_MS', 10 * 60 * 1000), // an empty room is forgotten after this long
    IDLE_MS: env('IDLE_MS', 5 * 60 * 1000),    // a connection (or a room) that has sent nothing the relay kept or forwarded for this long gives way to a newcomer when its room (or the relay) is full
  };
}

export function createRelay({ env = process.env, now = Date.now, log = (...a) => console.error(...a) } = {}) {
  const L = limitsOf(env);
  const { MAX_ROOM, MAX_ROOMS, MAX_MSG, MAX_SNAP, MAX_SNAP_BYTES, RATE, BURST, PRES_RATE, PRES_BURST, MAX_PRES, MAX_HERE_BYTES, SEAT_GRACE_MS, GHOST_MS, EMPTY_MS, IDLE_MS } = L;
  const rooms = new Map(); // code -> { clients:Set, snaps:Map<pid,{ws,text,at}>, here:Map<pid,{ws,text,at,sig}>, clock:{text,at}|null, seat:{pid,ws,left}|null, owner:pid|null, ownerProof:hash|null, gone:Timer|null, emptyAt:ms, keys:Map<pid,{proof,snapped,left}> }
  let snapBytes = 0, hereBytes = 0, listening = false, pinger = null;

  const http = createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Paperclip Capitalist relay. Connect with a WebSocket: ?room=CODE&pid=ID\n');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });

  const forget = (room, ws) => {
    const e = room.snaps.get(ws.pid); if (e && e.ws === ws) { room.snaps.delete(ws.pid); snapBytes -= e.text.length; }
    const h = room.here.get(ws.pid); if (h && h.ws === ws) { room.here.delete(ws.pid); hereBytes -= h.text.length; } // (where a member was is not told to a joiner once the member is gone)
  };
  const send = (c, text) => {
    if (c.readyState !== 1) return;
    if (c.bufferedAmount > 8 * 1024 * 1024) { c.terminate(); return; } // a client that does not read is cut off, not buffered for ever
    try { c.send(text); } catch { /* the socket just closed */ }
  };
  /** The instructor's seat: the first to claim it in a room, kept for its pid; another pid is given it only when the holder has been gone a while.
   *  The room's owner token is the other way to it. The first instructor to bring one binds the room to a hash of it, whoever sits in the seat then (a holder that showed no token is no owner: a stray tab, or the first to
   *  arrive after a restart, must not leave the room without one for good); from then on whoever brings the same token is the owner, from any device and under any Founder ID, and takes the seat from whoever sits in it.
   *  A token that does not match the bound one changes nothing, and a connection with none claims the seat as before. */
  const claim = (room, ws, at, ownerProof) => {
    const seat = room.seat;
    if (ownerProof) {
      if (room.ownerProof == null) room.ownerProof = ownerProof;
      if (sameHash(room.ownerProof, ownerProof)) { room.owner = ws.pid; room.seat = { pid: ws.pid, ws, left: 0 }; return; }
    }
    if (!seat) room.owner = ws.pid;
    if (!seat || seat.pid === ws.pid || ws.pid === room.owner || (SEAT_GRACE_MS > 0 && seat.ws.readyState !== 1 && at - seat.left > SEAT_GRACE_MS)) room.seat = { pid: ws.pid, ws, left: 0 };
  };
  /** Room in the table of pids for a new one: forget a pid that has been gone longer than GHOST_MS and is not the instructor's. A script that opens connections, greets (or sends one snapshot) and leaves fills the table with names that mean nothing;
   *  a real student is not kept out by them, for good. The names that only greeted go first, and then those that sent a snapshot (a student who has a run keeps their place as long as there is anything cheaper to forget), the one gone longest first. */
  const pruneKeys = (room, at) => {
    const live = new Set(); for (const c of room.clients) live.add(c.pid);
    let worst = null;
    for (const [pid, k] of room.keys) {
      if (!(k.left > 0 && at - k.left > GHOST_MS) || pid === room.owner || live.has(pid)) continue;
      if (!worst || +k.snapped < +worst[1].snapped || (+k.snapped === +worst[1].snapped && k.left < worst[1].left)) worst = [pid, k];
    }
    if (worst) room.keys.delete(worst[0]);
    return !!worst;
  };
  const isInstructor = (room, ws) => room.seat != null && room.seat.pid === ws.pid && ws.wantsSeat;
  /** A full room's way to make room: the connection that has said nothing for longest, if that is at least IDLE_MS ago, and never the instructor's seat. A handshake costs nothing and a socket that sends nothing is not asked
   *  for anything (it answers pings by itself), so a script could otherwise fill a room, or every room, and keep the class out for as long as it likes. A student who is in use is the newest, so is never the one. */
  const idlest = (room, at) => {
    let idle = null;
    for (const c of room.clients) if (c !== room.seat?.ws && at - c.lastAt >= IDLE_MS && (!idle || c.lastAt < idle.lastAt)) idle = c;
    return idle;
  };
  /** The last time anyone in a room said something. */
  const lastSaid = (room) => { let at = room.emptyAt; for (const c of room.clients) if (c.lastAt > at) at = c.lastAt; return at; };
  /** A token bucket: RATE messages a second, BURST at once (the instructor's seat gets five times as many: a slider dragged on the dashboard sends a clock per step). */
  const allow = (ws, at, scale) => {
    ws.tokens = Math.min(BURST * scale, ws.tokens + (at - ws.refilled) / 1000 * RATE * scale); ws.refilled = at;
    if (ws.tokens < 1) { if (++ws.strikes > 300) ws.terminate(); return false; }
    ws.tokens--; return true;
  };
  /** The bucket of presence frames: PRES_RATE a second, PRES_BURST at once, apart from the one above (a student's swaps and snapshots must not use up where they are, nor the other way round). Over it a frame is dropped, never queued. */
  const presAllow = (ws, at) => {
    ws.ptokens = Math.min(PRES_BURST, ws.ptokens + (at - ws.prefilled) / 1000 * PRES_RATE); ws.prefilled = at;
    if (ws.ptokens < 1) return false;
    ws.ptokens--; return true;
  };
  /**
   * A presence frame (version 2) from `ws`, as the relay handles it. Both kinds are rebuilt from a whitelist (`hereOf`, `actOf`): the frame that goes on is the relay's own, with `from` and `role` from the connection.
   *  here  where a member is and what it is doing. Goes to every other version 2 member, unless it says what the member's last said (then nothing is sent). The last one of each member is kept for a joiner, while the
   *        socket lives and while the relay's bytes for it hold out (past them it is still passed on, but the member's older one is dropped too, so a joiner is never told where a member was a while ago).
   *  act   what a student just did. Goes to the instructor's seat alone, never to a classmate, and is kept for nobody: it is news for whoever is at the dashboard when it happens.
   */
  /** `here` as a student is allowed to hear it under the room's switch: all of it, or (online) without the district, or (off) not at all. The text is the relay's own, whose first fields are always in this order. */
  const softly = (text) => text.replace(/^(\{"t":"here","z":)\d+/, (_, a) => a + '0');
  const shownTo = (room, ws, text) => (isInstructor(room, ws) || room.mode === 'full' ? text : room.mode === 'online' ? softly(text) : null);
  /** What a member who has just joined, or is allowed to hear more than it did, is told of where the others are: the last `here` of each, with its age, as far as the room's switch allows it. */
  const replayHere = (room, ws, t0) => {
    for (const e of room.here.values()) {
      if (e.ws === ws) continue;
      const out = shownTo(room, ws, e.text.slice(0, -1) + ',"age":' + (t0 - e.at) + '}');
      if (out) send(ws, out);
    }
  };
  /** The instructor's switch (`presence` in its clock): `online` or `off`, else everything. Students are told of each other only as far as it allows, so a page that is not shown a classmate's place was not sent it. A change that lets
   *  them hear more is followed by what the room already knows. (A relay that has just started knows no switch until the instructor's page says its clock again, which it does on every change and when it reconnects.) */
  const setMode = (room, word, t) => {
    const mode = word === 'online' || word === 'off' ? word : 'full';
    if (mode === room.mode) return;
    room.mode = mode;
    if (mode !== 'off') for (const c of room.clients) if (c.v >= 2 && !isInstructor(room, c)) replayHere(room, c, t);
  };
  const presence = (room, ws, m, size, t, instructor) => {
    if (ws.v < 2 || size > MAX_PRES || (m.t === 'act' && instructor)) return; // (an instructor reports nothing to the class)
    const o = m.t === 'here' ? hereOf(m, ws.name || '') : actOf(m, ws.name || '');
    if (!o || !presAllow(ws, t)) return;
    ws.lastAt = t; // a frame the relay passes on is a connection in use
    o.from = ws.pid; o.role = instructor ? 'instructor' : 'student';
    const out = JSON.stringify(o);
    if (o.t === 'act') { for (const c of room.clients) if (c !== ws && c.v >= 2 && isInstructor(room, c)) send(c, out); return; }
    const sig = o.z + '|' + o.s + '|' + o.handle, old = room.here.get(ws.pid);
    if (old && old.ws === ws && old.sig === sig) { old.at = t; return; } // the same again: the member is still here, and nobody needs telling
    const softSame = old && old.ws === ws && old.soft === o.s + '|' + o.handle; // (under `online` a change of district alone is no news to a student)
    const delta = out.length - (old ? old.text.length : 0);
    if (hereBytes + delta <= MAX_HERE_BYTES) { room.here.set(ws.pid, { ws, text: out, at: t, sig, soft: o.s + '|' + o.handle }); hereBytes += delta; }
    else if (old) { room.here.delete(ws.pid); hereBytes -= old.text.length; }
    for (const c of room.clients) {
      if (c === ws || c.v < 2) continue;
      if (softSame && room.mode === 'online' && !isInstructor(room, c)) continue;
      const text = shownTo(room, c, out);
      if (text) send(c, text);
    }
  };

  wss.on('connection', (ws, req) => {
    ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } }); // an oversize or malformed frame is the sender's fault, never the relay's
    let u;
    try { u = new URL(req.url, 'http://x'); } catch { ws.close(1008, 'bad request'); return; }
    const code = (u.searchParams.get('room') || '').toUpperCase();
    const pid = u.searchParams.get('pid') || '';
    if (!/^[A-Z0-9]{3,12}$/.test(code) || !PID.test(pid)) { ws.close(1008, 'bad room'); return; }
    const key = u.searchParams.get('key') || '';
    if (!KEY.test(key)) { ws.close(1008, 'identity key required'); return; } // before a room is made for it
    let room = rooms.get(code);
    if (!room) {
      // a full relay forgets the room that has been empty longest before it turns a class away: rooms opened and abandoned (up to ten minutes each) could otherwise fill it
      if (rooms.size >= MAX_ROOMS) {
        let old = null;
        for (const [c, r] of rooms) if (!r.clients.size && (!old || r.emptyAt < old[1].emptyAt)) old = [c, r];
        if (!old) { // no room is empty: the room nobody has said anything in for longest, if that was at least IDLE_MS ago (a class in use always has someone who spoke lately)
          const t = now(); let quiet = null;
          for (const [c, r] of rooms) { const at = lastSaid(r); if (t - at >= IDLE_MS && (!quiet || at < quiet[2])) quiet = [c, r, at]; }
          if (quiet) { old = quiet; for (const c of quiet[1].clients) c.terminate(); quiet[1].clients.clear(); }
        }
        if (!old) { ws.close(1013, 'relay full'); return; }
        if (old[1].gone) clearTimeout(old[1].gone);
        rooms.delete(old[0]);
      }
      rooms.set(code, (room = { clients: new Set(), snaps: new Map(), here: new Map(), mode: 'full', clock: null, seat: null, owner: null, ownerProof: null, gone: null, emptyAt: 0, keys: new Map() }));
    }
    if (room.clients.size >= MAX_ROOM && !idlest(room, now())) { ws.close(1013, 'room full'); return; }
    // who this is: the pid is the name, the key is the proof (see the head of the file). Refused before anything else is done for the connection: it is not told about the room, and it joins nothing.
    const proof = createHash('sha256').update(code + '|' + pid + '|' + key).digest('hex');
    const bound = room.keys.get(pid);
    if (bound !== undefined && bound.proof !== proof) { ws.close(1008, 'identity does not match'); return; }
    if (bound === undefined) {
      if (room.keys.size >= MAX_ROOM * 2 && !pruneKeys(room, now())) { ws.close(1013, 'room full'); return; }
      room.keys.set(pid, { proof, snapped: false, left: 0 });
    } else bound.left = 0;
    if (room.gone) { clearTimeout(room.gone); room.gone = null; }
    const t0 = now();
    ws.pid = pid; ws.alive = true; ws.tokens = BURST; ws.refilled = t0; ws.strikes = 0; ws.lastAt = t0; ws.ptokens = PRES_BURST; ws.prefilled = t0;
    const asked = Number.parseInt(u.searchParams.get('v') ?? '', 10);
    ws.v = Number.isInteger(asked) && asked >= 1 && asked <= 9 ? asked : 1; // the version of the protocol this client speaks: 2 is presence; a client that says nothing is 1, and hears nothing of it
    ws.wantsSeat = u.searchParams.get('role') === 'instructor';
    if (ws.wantsSeat) {
      const token = u.searchParams.get('owner') || '';
      claim(room, ws, t0, KEY.test(token) ? createHash('sha256').update(code + '|owner|' + token).digest('hex') : null);
    }
    if (room.clients.size >= MAX_ROOM) { // the identity is good: the connection that has been silent longest gives its place (it reconnects by itself, if it is a student's)
      const idle = idlest(room, t0);
      if (idle) { room.clients.delete(idle); idle.terminate(); }
    }
    room.clients.add(ws);
    if (ws.v >= 2) send(ws, WELCOME); // first, so a client knows what it may say before it hears what the room is doing
    if (room.clock) send(ws, room.clock.text.slice(0, -1) + ',"age":' + (t0 - room.clock.at) + '}');
    for (const e of room.snaps.values()) send(ws, e.text.slice(0, -1) + ',"age":' + (t0 - e.at) + '}');
    if (ws.v >= 2) replayHere(room, ws, t0);

    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, isBinary) => {
      // nothing a frame holds may throw out of here: an exception in a listener ends this socket's receiver (and, uncaught, is all the relay has to stand on), so it ends this one connection, not the service
      try {
        const t = now(), instructor = isInstructor(room, ws);
        if (!allow(ws, t, instructor ? 5 : 1) || isBinary) return; // the bucket first: a binary frame is dropped, but a socket that sends nothing else pays for each one (and is cut off at 300 strikes)
        const text = data.toString();
        if (text.length > MAX_MSG || nesting(text, 32) > 32) return;
        let m;
        try { m = JSON.parse(text); } catch { return; }
        if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !TYPES.has(m.t)) return;
        if (INSTRUCTOR_ONLY.has(m.t) && !instructor) return;
        if (m.t === 'hello' && typeof m.handle === 'string') ws.name = plain(m.handle, 24); // the one alias the room knows this member by (a `here` or an `act` carries it, whatever the frame says); a hello that names none leaves it as it was
        if (PRESENCE.has(m.t)) { presence(room, ws, m, text.length, t, instructor); return; } // (its own rules: rebuilt, rate limited, routed)
        if (m.t === 'snap' && (instructor || text.length > MAX_SNAP || typeof m.snap !== 'object' || m.snap === null)) return;
        if (m.t === 'bye') forget(room, ws);
        ws.lastAt = t; // a frame the relay keeps or forwards is a connection in use (one it drops is not)
        // who it is from, and in what role, is the connection's word, never the message's
        m.from = ws.pid; m.role = instructor ? 'instructor' : 'student'; delete m.age;
        const out = JSON.stringify(m);
        if (m.t === 'snap') {
          const old = room.snaps.get(ws.pid);
          const delta = out.length - (old ? old.text.length : 0); // whatever this pid had remembered is replaced
          if (snapBytes + delta > MAX_SNAP_BYTES) return;
          snapBytes += delta; room.snaps.set(ws.pid, { ws, text: out, at: t });
          const k = room.keys.get(ws.pid); if (k) k.snapped = true;
        } else if (m.t === 'clock') { room.clock = { text: out, at: t }; setMode(room, m.presence, t); }
        if (typeof m.to === 'string') { for (const c of room.clients) if (c !== ws && c.pid === m.to) send(c, out); } // addressed to one founder
        else for (const c of room.clients) if (c !== ws) send(c, out);
      } catch (e) {
        log('relay: a frame was refused:', e && e.message);
        try { ws.terminate(); } catch { /* gone */ }
      }
    });
    ws.on('close', () => {
      room.clients.delete(ws);
      forget(room, ws);
      if (room.seat && room.seat.ws === ws) room.seat.left = now();
      // the last socket of a pid has gone: the others are told, as if it had said goodbye (a closed tab or a dropped connection says nothing), so a name that only ever greeted does not stay in their tables as someone online
      if (![...room.clients].some((c) => c.pid === ws.pid)) {
        const k = room.keys.get(ws.pid); if (k) k.left = now();
        const bye = JSON.stringify({ t: 'bye', from: ws.pid, role: 'student' });
        for (const c of room.clients) send(c, bye);
      }
      if (!room.clients.size && !room.gone) {
        room.emptyAt = now();
        room.gone = setTimeout(() => { if (rooms.get(code) === room && !room.clients.size) rooms.delete(code); }, EMPTY_MS);
        room.gone.unref?.();
      }
    });
  });

  return {
    http, wss, rooms, limits: L,
    /** What the relay holds now, for a test or an operator: rooms, connections, and the bytes of remembered snapshots and presence (the bounds are MAX_SNAP_BYTES and MAX_HERE_BYTES). */
    stats() { let clients = 0; for (const r of rooms.values()) clients += r.clients.size; return { rooms: rooms.size, clients, snapBytes, hereBytes }; },
    /** Starts listening (PORT=0 picks a free port; `host` is every interface unless one is given: a test gives 127.0.0.1). Resolves with the port; rejects if the port cannot be had. After that a fault is logged and the classes go on. */
    listen(port = L.PORT, host) {
      return new Promise((resolve, reject) => {
        const fatal = (what) => (e) => { if (!listening) reject(Object.assign(e, { what })); else log(`relay: ${what} error:`, e.message); };
        http.on('error', fatal('http'));
        wss.on('error', fatal('socket server'));
        const up = () => {
          listening = true;
          pinger = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* gone */ } } }, 20000);
          pinger.unref?.();
          resolve(http.address().port);
        };
        if (host) http.listen(port, host, up); else http.listen(port, up);
      });
    },
    /** A planned stop (a restart, a deploy): every client is told the relay is going away (close code 1001, which a browser's reconnect treats as a pause, not a fault), given `grace` ms to say goodbye, and then it is closed. */
    shutdown(grace = 1000) {
      for (const ws of wss.clients) { try { ws.close(1001, 'relay restarting'); } catch { /* gone */ } }
      return new Promise((resolve) => {
        const done = () => { clearTimeout(t); this.close().then(resolve); };
        const t = setTimeout(done, grace); t.unref?.();
        const poll = setInterval(() => { if (!wss.clients.size) { clearInterval(poll); done(); } }, 25); poll.unref?.();
      });
    },
    /** Closes every connection and the server, and forgets every room. */
    close() {
      return new Promise((resolve) => {
        if (pinger) clearInterval(pinger);
        for (const room of rooms.values()) if (room.gone) clearTimeout(room.gone);
        rooms.clear(); snapBytes = 0; hereBytes = 0;
        for (const ws of wss.clients) { try { ws.terminate(); } catch { /* gone */ } }
        wss.close(() => { if (http.listening) http.close(() => resolve()); else resolve(); });
      });
    },
  };
}

// ---- started as a program: `node relay.mjs`
const asProgram = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (asProgram) {
  // the last resort: a fault in one message must not end every class on this relay
  process.on('uncaughtException', (e) => console.error('relay: uncaught:', e && e.message));
  process.on('unhandledRejection', (e) => console.error('relay: unhandled:', e && e.message));
  // An error before the relay is listening (the port is taken, or not ours to use) is the end of this process, with a failing exit code so `npm start` and a service manager see it.
  const relay = createRelay();
  relay.listen().then((port) => console.log(`relay listening on :${port}`), (e) => { console.error(`relay: ${e.what || 'http'} error:`, e.message); process.exit(1); });
  // A normal stop (a deploy, `docker stop`, Ctrl-C) tells the classes the relay is going away and then ends; as PID 1 of a container a process with no handler for SIGTERM is not stopped by it at all.
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
    if (stopping) return; stopping = true;
    console.error(`relay: ${sig}, closing`);
    const hard = setTimeout(() => process.exit(0), 3000); hard.unref?.();
    relay.shutdown().then(() => process.exit(0), () => process.exit(1));
  });
}
