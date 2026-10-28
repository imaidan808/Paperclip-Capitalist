// Minimal classroom relay: forwards JSON messages between everyone in a room and replays the last
// snapshot per connected founder (and the last clock) to late joiners. It keeps nothing on disk and never logs payloads.
//   cd server && npm install && npm start      (PORT=8787 by default; PORT=0 picks a free one and says which)
//
// It is the one process every class shares, so it trusts nobody and must not fall over:
//  - every socket has an error handler, a message rate and a size limit; a frame that is binary, oversize, not JSON or of an unknown type is dropped;
//  - `from` and `role` are stamped by the relay from the connection, never taken from the message. The first connection to claim the instructor's seat in a
//    room holds it (its own pid can always reclaim it); only the instructor can send clock, inject or rewind;
//  - a message with a `to` goes to that founder alone, not to the whole room;
//  - snapshots are kept only for sockets still connected, are size-capped, and are replayed with their age; rooms, clients, bytes are all bounded.
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

const env = (k, d) => (process.env[k] != null && process.env[k] !== '' && Number.isFinite(+process.env[k]) ? +process.env[k] : d);
const PORT = env('PORT', 8787);
const MAX_ROOM = env('MAX_ROOM', 400);            // clients in one room
const MAX_ROOMS = env('MAX_ROOMS', 200);          // rooms on this relay
const MAX_MSG = env('MAX_MSG', 32 * 1024);        // any frame: a real message is a few KB
const MAX_SNAP = env('MAX_SNAP', 16 * 1024);      // a snapshot: a real one is about 3 KB
const MAX_SNAP_BYTES = env('MAX_SNAP_BYTES', 64 * 1024 * 1024); // all remembered snapshots on this relay
const RATE = env('RATE', 20), BURST = env('BURST', 60); // messages a second a socket may send, and how many at once
const SEAT_GRACE_MS = env('SEAT_GRACE_MS', 5 * 60 * 1000); // how long the instructor's seat is held for a different pid once its holder is gone
const EMPTY_MS = env('EMPTY_MS', 10 * 60 * 1000);          // an empty room is forgotten after this long
const TYPES = new Set(['hello', 'bye', 'snap', 'clock', 'inject', 'rewind', 'rewound', 'offer', 'accept', 'confirm', 'abort', 'reject', 'deliver', 'decline', 'withdraw', 'royalty', 'flag']);
const INSTRUCTOR_ONLY = new Set(['clock', 'inject', 'rewind']);
const PID = /^[A-Za-z0-9_.-]{1,24}$/;

const rooms = new Map(); // code -> { clients:Set, snaps:Map<pid,{ws,text,at}>, clock:{text,at}|null, seat:{pid,ws,left}|null, gone:Timer|null }
let snapBytes = 0;

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Paperclip Capitalist relay. Connect with a WebSocket: ?room=CODE&pid=ID\n');
});
const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });
http.on('error', (e) => console.error('relay: http error:', e.message));
wss.on('error', (e) => console.error('relay: socket server error:', e.message));
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
  if (!seat || seat.pid === ws.pid || (seat.ws.readyState !== 1 && now - seat.left > SEAT_GRACE_MS)) room.seat = { pid: ws.pid, ws, left: 0 };
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
  let room = rooms.get(code);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) { ws.close(1013, 'relay full'); return; }
    rooms.set(code, (room = { clients: new Set(), snaps: new Map(), clock: null, seat: null, gone: null }));
  }
  if (room.clients.size >= MAX_ROOM) { ws.close(1013, 'room full'); return; }
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
    const t = Date.now(), instructor = isInstructor(room, ws);
    if (isBinary || !allow(ws, t, instructor ? 5 : 1)) return;
    const text = data.toString();
    if (text.length > MAX_MSG) return;
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
    } else if (m.t === 'clock') room.clock = { text: out, at: t };
    if (typeof m.to === 'string') { for (const c of room.clients) if (c !== ws && c.pid === m.to) send(c, out); } // addressed to one founder
    else for (const c of room.clients) if (c !== ws) send(c, out);
  });
  ws.on('close', () => {
    room.clients.delete(ws);
    forget(room, ws);
    if (room.seat && room.seat.ws === ws) room.seat.left = Date.now();
    if (!room.clients.size && !room.gone) {
      room.gone = setTimeout(() => { if (rooms.get(code) === room && !room.clients.size) rooms.delete(code); }, EMPTY_MS);
      room.gone.unref?.();
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* gone */ } }
}, 20000).unref();

http.listen(PORT, () => console.log(`relay listening on :${http.address().port}`));
