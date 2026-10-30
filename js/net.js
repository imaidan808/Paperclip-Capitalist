// Transport for multiplayer. Two interchangeable backends behind one tiny interface:
//   local  - BroadcastChannel: every tab of this browser on the same origin. Works on GitHub Pages with no server.
//   relay  - WebSocket to server/relay.mjs: real classrooms across devices.
// Messages are small JSON objects; the relay only forwards and remembers the last snapshot per founder.
// Nothing here trusts what it hears: a frame that is not a small JSON object is dropped, and a handler that throws never stops the rest.
export const roomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const MAX_FRAME = 32 * 1024; // the relay's limit (server/relay.mjs): a real message is a few KB, a snapshot about 3

const LAB_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[^/:]+\.(local|lan))$/i;
/**
 * The WebSocket address of a relay as a person types or pastes it, or '' when what they gave is not an address. A host gives an instructor an https address (https://paperclip-relay.onrender.com) and the browser needs wss://,
 * so https becomes wss and http becomes ws; a bare host name is wss, because the game is served over https, where a plain ws:// is blocked as mixed content, unless it names a machine of a lab (localhost, a private
 * address, .local, .lan), which is ws. A path and a query stay (a relay behind a proxy), a fragment and a trailing slash go. Only ws, wss, http and https are addresses: nothing else is let through.
 */
export function cleanRelay(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim(); if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) { // no scheme: a bare host name, with an optional port and path
    if (s.startsWith('//') || /\s/.test(s) || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return ''; // ('javascript:...', 'data:...': a scheme without the slashes)
    const host = s.split(/[/?#]/)[0].replace(/:\d+$/, '');
    if (!/^([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])$/i.test(host) || !(host.includes('.') || /^localhost$|^\[/i.test(host))) return ''; // ('hello', 'not_a_host', '12345')
    s = (LAB_HOST.test(host) ? 'ws://' : 'wss://') + s;
  }
  let u; try { u = new URL(s); } catch { return ''; }
  const proto = { 'ws:': 'ws:', 'wss:': 'wss:', 'http:': 'ws:', 'https:': 'wss:' }[u.protocol];
  if (!proto || !u.hostname) return '';
  return proto + '//' + u.host + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')) + u.search;
}

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
  constructor(url, code, pid, role, key, owner) {
    this.kind = 'relay';
    this.state = 'connecting';
    // `key` is the secret that stays in this browser beside the pid: the relay binds the pid to it the first time it sees the pid in a room and refuses anyone else who connects as that pid (server/relay.mjs)
    this.url = url + (url.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(code) + '&pid=' + encodeURIComponent(pid) + '&key=' + encodeURIComponent(key || '') + '&role=' + (role === 'instructor' ? 'instructor' : 'student')
      // an instructor's room-owner token (server/relay.mjs): what lets the same instructor take the seat back from another device. Never sent for a student.
      + (role === 'instructor' && owner ? '&owner=' + encodeURIComponent(owner) : '');
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
  /** @param {{code:string, pid:string, key?:string, owner?:string, handle:string, role:'student'|'instructor', relay?:string}} o */
  constructor(o) {
    Object.assign(this, o);
    this.handlers = new Set();
    this.transport = o.relay ? new RelayTransport(o.relay, o.code, o.pid, o.role, o.key, o.owner) : new LocalTransport(o.code);
    this.transport.onmsg = (m) => { if (m && typeof m === 'object' && m.from !== this.pid) for (const h of this.handlers) { try { h(m); } catch { /* one handler's fault is not the others' */ } } };
    this.transport.onstate = (s) => this.onstate?.(s);
  }
  get kind() { return this.transport.kind; }
  get state() { return this.transport.state; }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  send(msg) { this.transport.send({ ...msg, from: this.pid, role: this.role, handle: this.handle, ts: Date.now() }); }
  close() { try { this.send({ t: 'bye' }); } catch { /* noop */ } this.transport.close(); }
}
