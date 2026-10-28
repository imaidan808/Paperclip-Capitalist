// Minimal classroom relay: forwards JSON messages between everyone in a room and replays the last
// snapshot per connected founder (and the last clock) to late joiners. It keeps nothing on disk and never logs payloads.
//   cd server && npm install && npm start      (PORT=8787 by default; PORT=0 picks a free one and says which)
//
// It is the one process every class shares, so it trusts nobody and must not fall over:
//  - every socket has an error handler, a message rate and a size limit; a frame that is binary, oversize, not JSON or of an unknown type is dropped;
//  - `from` and `role` are stamped by the relay from the connection, never taken from the message. The first connection to claim the instructor's seat in a
//    room holds it, and its pid (with its key, below) can always take it back from anyone; no other pid is ever handed it while the room lives (a timer was: a laptop lid closed for a break and a student was the instructor,
//    with the real one locked out. An operator who wants a handover after a long absence sets SEAT_GRACE_MS). Only the instructor can send clock, inject or rewind;
//  - a pid is not an identity (every message carries the sender's, so every classmate knows everyone's): a connection must bring `key`, a secret its browser keeps beside the pid. The first connection
//    to use a pid in a room binds the pid to a hash of its key (nothing else is kept of it, and it is never logged), and a later connection for that pid with another key, or none, is refused. That is
//    what stops a classmate from taking the instructor's seat, or a classmate's name and snapshot, by connecting with the pid they have read off the wire;
//  - a message with a `to` goes to that founder alone, not to the whole room;
//  - snapshots are kept only for sockets still connected, are size-capped, and are replayed with their age; rooms, clients, bytes are all bounded.
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const env = (k, d) => (process.env[k] != null && process.env[k] !== '' && Number.isFinite(+process.env[k]) ? +process.env[k] : d);
const PORT = env('PORT', 8787);
const MAX_ROOM = env('MAX_ROOM', 400);            // clients in one room
const MAX_ROOMS = env('MAX_ROOMS', 200);          // rooms on this relay
const MAX_MSG = env('MAX_MSG', 32 * 1024);        // any frame: a real message is a few KB
const MAX_SNAP = env('MAX_SNAP', 16 * 1024);      // a snapshot: a real one is about 3 KB
const MAX_SNAP_BYTES = env('MAX_SNAP_BYTES', 64 * 1024 * 1024); // all remembered snapshots on this relay
const RATE = env('RATE', 20), BURST = env('BURST', 60); // messages a second a socket may send, and how many at once
const SEAT_GRACE_MS = env('SEAT_GRACE_MS', 0); // 0: never. How long the instructor's seat is held against a DIFFERENT pid once its holder is gone (the owner takes it back whatever this says)
const GHOST_MS = env('GHOST_MS', 30 * 1000);   // a pid that connected, never sent a snapshot and has been gone this long may be forgotten to make room for a new one
const EMPTY_MS = env('EMPTY_MS', 10 * 60 * 1000);          // an empty room is forgotten after this long
const TYPES = new Set(['hello', 'bye', 'snap', 'clock', 'inject', 'rewind', 'rewound', 'offer', 'accept', 'confirm', 'abort', 'reject', 'deliver', 'ack', 'decline', 'withdraw', 'royalty', 'flag']);
const INSTRUCTOR_ONLY = new Set(['clock', 'inject', 'rewind']);
const PID = /^[A-Za-z0-9_.-]{1,24}$/;
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

const rooms = new Map(); // code -> { clients:Set, snaps:Map<pid,{ws,text,at}>, clock:{text,at}|null, seat:{pid,ws,left}|null, owner:pid|null, gone:Timer|null, emptyAt:ms, keys:Map<pid,{proof,snapped,left}> }
let snapBytes = 0;

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Paperclip Capitalist relay. Connect with a WebSocket: ?room=CODE&pid=ID\n');
});
const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });
// An error before the relay is listening (the port is taken, or not ours to use) is the end of this process, with a failing exit code so `npm start` and a service manager see it. Afterwards a fault is logged and the classes go on.
let listening = false;
const fatal = (what) => (e) => { console.error(`relay: ${what} error:`, e.message); if (!listening) process.exit(1); };
http.on('error', fatal('http'));
wss.on('error', fatal('socket server'));
// the last resort: a fault in one message must not end every class on this relay
process.on('uncaughtException', (e) => console.error('relay: uncaught:', e && e.message));
process.on('unhandledRejection', (e) => console.error('relay: unhandled:', e && e.message));

const forget = (room, ws) => { const e = room.snaps.get(ws.pid); if (e && e.ws === ws) { room.snaps.delete(ws.pid); snapBytes -= e.text.length; } };
const send = (c, text) => {
  if (c.readyState !== 1) return;
  if (c.bufferedAmount > 8 * 1024 * 1024) { c.terminate(); return; } // a client that does not read is cut off, not buffered for ever
  try { c.send(text); } catch { /* the socket just closed */ }
};
/** The instructor's seat: the first to claim it in a room, kept for its pid; another pid is given it only when the holder has been gone a while. */
const claim = (room, ws, now) => {
  const seat = room.seat;
  if (!seat) room.owner = ws.pid;
  if (!seat || seat.pid === ws.pid || ws.pid === room.owner || (SEAT_GRACE_MS > 0 && seat.ws.readyState !== 1 && now - seat.left > SEAT_GRACE_MS)) room.seat = { pid: ws.pid, ws, left: 0 };
};
/** Room in the table of pids for a new one: forget the oldest pid that is gone, never sent a snapshot and is not the instructor's. A script that opens connections, greets and leaves fills the table with names that mean nothing; a real student is not kept out by them. */
const pruneKeys = (room, now) => {
  let worst = null;
  for (const [pid, k] of room.keys) if (!k.snapped && k.left > 0 && now - k.left > GHOST_MS && pid !== room.owner && ![...room.clients].some((c) => c.pid === pid) && (!worst || k.left < worst[1].left)) worst = [pid, k];
  if (worst) room.keys.delete(worst[0]);
  return !!worst;
};
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
const isInstructor = (room, ws) => room.seat != null && room.seat.pid === ws.pid && ws.wantsSeat;
/** A token bucket: RATE messages a second, BURST at once (the instructor's seat gets five times as many: a slider dragged on the dashboard sends a clock per step). */
const allow = (ws, now, scale) => {
  ws.tokens = Math.min(BURST * scale, ws.tokens + (now - ws.refilled) / 1000 * RATE * scale); ws.refilled = now;
  if (ws.tokens < 1) { if (++ws.strikes > 300) ws.terminate(); return false; }
  ws.tokens--; return true;
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
      if (!old) { ws.close(1013, 'relay full'); return; }
      if (old[1].gone) clearTimeout(old[1].gone);
      rooms.delete(old[0]);
    }
    rooms.set(code, (room = { clients: new Set(), snaps: new Map(), clock: null, seat: null, owner: null, gone: null, emptyAt: 0, keys: new Map() }));
  }
  if (room.clients.size >= MAX_ROOM) { ws.close(1013, 'room full'); return; }
  // who this is: the pid is the name, the key is the proof (see the head of the file). Refused before anything else is done for the connection: it is not told about the room, and it joins nothing.
  const proof = createHash('sha256').update(code + '|' + pid + '|' + key).digest('hex');
  const bound = room.keys.get(pid);
  if (bound !== undefined && bound.proof !== proof) { ws.close(1008, 'identity does not match'); return; }
  if (bound === undefined) {
    if (room.keys.size >= MAX_ROOM * 2 && !pruneKeys(room, Date.now())) { ws.close(1013, 'room full'); return; }
    room.keys.set(pid, { proof, snapped: false, left: 0 });
  } else bound.left = 0;
  if (room.gone) { clearTimeout(room.gone); room.gone = null; }
  const now = Date.now();
  ws.pid = pid; ws.alive = true; ws.tokens = BURST; ws.refilled = now; ws.strikes = 0;
  ws.wantsSeat = u.searchParams.get('role') === 'instructor';
  if (ws.wantsSeat) claim(room, ws, now);
  room.clients.add(ws);
  if (room.clock) send(ws, room.clock.text.slice(0, -1) + ',"age":' + (now - room.clock.at) + '}');
  for (const e of room.snaps.values()) send(ws, e.text.slice(0, -1) + ',"age":' + (now - e.at) + '}');

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data, isBinary) => {
    // nothing a frame holds may throw out of here: an exception in a listener ends this socket's receiver (and, uncaught, is all the relay has to stand on), so it ends this one connection, not the service
    try {
      const t = Date.now(), instructor = isInstructor(room, ws);
      if (isBinary || !allow(ws, t, instructor ? 5 : 1)) return;
      const text = data.toString();
      if (text.length > MAX_MSG || nesting(text, 32) > 32) return;
      let m;
      try { m = JSON.parse(text); } catch { return; }
      if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !TYPES.has(m.t)) return;
      if (INSTRUCTOR_ONLY.has(m.t) && !instructor) return;
      if (m.t === 'snap' && (instructor || text.length > MAX_SNAP || typeof m.snap !== 'object' || m.snap === null)) return;
      if (m.t === 'bye') forget(room, ws);
      // who it is from, and in what role, is the connection's word, never the message's
      m.from = ws.pid; m.role = instructor ? 'instructor' : 'student'; delete m.age;
      const out = JSON.stringify(m);
      if (m.t === 'snap') {
        const old = room.snaps.get(ws.pid);
        const delta = out.length - (old ? old.text.length : 0); // whatever this pid had remembered is replaced
        if (snapBytes + delta > MAX_SNAP_BYTES) return;
        snapBytes += delta; room.snaps.set(ws.pid, { ws, text: out, at: t });
        const k = room.keys.get(ws.pid); if (k) k.snapped = true;
      } else if (m.t === 'clock') room.clock = { text: out, at: t };
      if (typeof m.to === 'string') { for (const c of room.clients) if (c !== ws && c.pid === m.to) send(c, out); } // addressed to one founder
      else for (const c of room.clients) if (c !== ws) send(c, out);
    } catch (e) {
      console.error('relay: a frame was refused:', e && e.message);
      try { ws.terminate(); } catch { /* gone */ }
    }
  });
  ws.on('close', () => {
    room.clients.delete(ws);
    forget(room, ws);
    if (room.seat && room.seat.ws === ws) room.seat.left = Date.now();
    // the last socket of a pid has gone: the others are told, as if it had said goodbye (a closed tab or a dropped connection says nothing), so a name that only ever greeted does not stay in their tables as someone online
    if (![...room.clients].some((c) => c.pid === ws.pid)) {
      const k = room.keys.get(ws.pid); if (k) k.left = Date.now();
      const bye = JSON.stringify({ t: 'bye', from: ws.pid, role: 'student' });
      for (const c of room.clients) send(c, bye);
    }
    if (!room.clients.size && !room.gone) {
      room.emptyAt = Date.now();
      room.gone = setTimeout(() => { if (rooms.get(code) === room && !room.clients.size) rooms.delete(code); }, EMPTY_MS);
      room.gone.unref?.();
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* gone */ } }
}, 20000).unref();

http.listen(PORT, () => { listening = true; console.log(`relay listening on :${http.address().port}`); });
