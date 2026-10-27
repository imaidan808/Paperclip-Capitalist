// Minimal classroom relay: forwards JSON messages between everyone in a room and replays the last
// snapshot per founder (and the last clock) to late joiners. It keeps nothing on disk and never logs payloads.
//   cd server && npm install && npm start      (PORT=8787 by default)
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

const PORT = +process.env.PORT || 8787;
const MAX_ROOM = +process.env.MAX_ROOM || 400;
const MAX_MSG = 64 * 1024;
const rooms = new Map(); // code -> { clients:Set, snaps:Map, clock:string|null, idle:number }

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Paperclip Capitalist relay. Connect with a WebSocket: ?room=CODE&pid=ID\n');
});
const wss = new WebSocketServer({ server: http, maxPayload: MAX_MSG });

wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x');
  const code = (u.searchParams.get('room') || '').toUpperCase();
  const pid = (u.searchParams.get('pid') || '').slice(0, 24);
  if (!/^[A-Z0-9]{3,12}$/.test(code) || !pid) { ws.close(1008, 'bad room'); return; }
  let room = rooms.get(code);
  if (!room) rooms.set(code, (room = { clients: new Set(), snaps: new Map(), clock: null }));
  if (room.clients.size >= MAX_ROOM) { ws.close(1013, 'room full'); return; }
  ws.pid = pid; ws.alive = true;
  room.clients.add(ws);
  if (room.clock) ws.send(room.clock);
  for (const s of room.snaps.values()) ws.send(s);

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data) => {
    const text = data.toString();
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'snap') room.snaps.set(pid, text);
    else if (m.t === 'clock' && m.role === 'instructor') room.clock = text;
    else if (m.t === 'bye') room.snaps.delete(pid);
    for (const c of room.clients) if (c !== ws && c.readyState === 1) c.send(text);
  });
  ws.on('close', () => {
    room.clients.delete(ws);
    if (!room.clients.size) setTimeout(() => { const r = rooms.get(code); if (r && !r.clients.size) rooms.delete(code); }, 10 * 60 * 1000);
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 20000);

http.listen(PORT, () => console.log(`relay listening on :${PORT}`));
