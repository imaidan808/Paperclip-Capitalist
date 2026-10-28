// Transport for multiplayer. Two interchangeable backends behind one tiny interface:
//   local  - BroadcastChannel: every tab of this browser on the same origin. Works on GitHub Pages with no server.
//   relay  - WebSocket to server/relay.mjs: real classrooms across devices.
// Messages are small JSON objects; the relay only forwards and remembers the last snapshot per founder.
// Nothing here trusts what it hears: a frame that is not a small JSON object is dropped, and a handler that throws never stops the rest.
export const roomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const MAX_FRAME = 32 * 1024; // the relay's limit (server/relay.mjs): a real message is a few KB, a snapshot about 3

class LocalTransport {
  constructor(code) {
    this.kind = 'local';
    this.state = 'open';
    this.bc = new BroadcastChannel('paperclip-capitalist-' + code);
    this.bc.onmessage = (e) => this.onmsg?.(e.data);
  }
  send(m) { try { this.bc.postMessage(m); } catch { /* not cloneable: nothing to say */ } }
  close() { this.bc.close(); this.state = 'closed'; }
}

class RelayTransport {
  constructor(url, code, pid, role, key) {
    this.kind = 'relay';
    this.state = 'connecting';
    // `key` is the secret that stays in this browser beside the pid: the relay binds the pid to it the first time it sees the pid in a room and refuses anyone else who connects as that pid (server/relay.mjs)
    this.url = url + (url.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code) + '&pid=' + encodeURIComponent(pid) + '&key=' + encodeURIComponent(key || '') + '&role=' + (role === 'instructor' ? 'instructor' : 'student');
    this.queue = [];
    this.tries = 0;
    this.closed = false;
    this.open();
  }
  open() {
    if (this.closed) return;
    try { this.ws = new WebSocket(this.url); } catch { this.state = 'error'; this.onstate?.(this.state); return; }
    this.ws.onopen = () => { this.state = 'open'; this.tries = 0; this.onstate?.(this.state); for (const m of this.queue.splice(0)) this.ws.send(m); };
    this.ws.onmessage = (e) => { if (typeof e.data !== 'string' || e.data.length > MAX_FRAME) return; try { this.onmsg?.(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
    this.ws.onclose = () => {
      if (this.closed) return;
      this.state = 'reconnecting'; this.onstate?.(this.state);
      setTimeout(() => this.open(), Math.min(15000, 800 * 2 ** this.tries++));
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch { /* already closed */ } };
  }
  send(m) {
    const s = JSON.stringify(m);
    if (s.length > MAX_FRAME) return; // the relay would drop it (and a frame that large is a bug here)
    if (this.ws?.readyState === 1) this.ws.send(s);
    else if (this.queue.length < 60) this.queue.push(s);
  }
  close() { this.closed = true; this.state = 'closed'; try { this.ws?.close(); } catch { /* noop */ } }
}

export class Room {
  /** @param {{code:string, pid:string, key?:string, handle:string, role:'student'|'instructor', relay?:string}} o */
  constructor(o) {
    Object.assign(this, o);
    this.handlers = new Set();
    this.transport = o.relay ? new RelayTransport(o.relay, o.code, o.pid, o.role, o.key) : new LocalTransport(o.code);
    this.transport.onmsg = (m) => { if (m && typeof m === 'object' && m.from !== this.pid) for (const h of this.handlers) { try { h(m); } catch { /* one handler's fault is not the others' */ } } };
    this.transport.onstate = (s) => this.onstate?.(s);
  }
  get kind() { return this.transport.kind; }
  get state() { return this.transport.state; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  send(msg) { this.transport.send({ ...msg, from: this.pid, role: this.role, handle: this.handle, ts: Date.now() }); }
  close() { try { this.send({ t: 'bye' }); } catch { /* noop */ } this.transport.close(); }
}
