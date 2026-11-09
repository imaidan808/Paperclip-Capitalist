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
    this.caps = new Set(); // nothing is promised here: there is no relay to say what it takes (presence, "here" and "act", is the relay's)
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
      + (role === 'instructor' && owner ? '&owner=' + encodeURIComponent(owner) : '')
      // the version of the protocol this client speaks: 2 is presence (server/relay.mjs). A relay of before that ignores it, and so never welcomes the client, which then says nothing the relay would not know.
      + '&v=2';
    this.caps = new Set(); // what the relay has promised to take from this client, from its welcome; empty until it comes, and again whenever the connection drops
    this.queue = [];
    this.tries = 0;
    this.closed = false;
    this.open();
  }
  open() {
    if (this.closed) return;
    try { this.ws = new WebSocket(this.url); } catch { this.state = 'error'; this.onstate?.(this.state); return; }
    this.ws.onopen = () => { this.state = 'open'; this.tries = 0; this.onstate?.(this.state); for (const m of this.queue.splice(0)) this.ws.send(m); };
    this.ws.onmessage = (e) => { if (typeof e.data !== 'string' || e.data.length > MAX_FRAME) return; try { const m = JSON.parse(e.data); if (!this._welcome(m)) this.onmsg?.(m); } catch { /* ignore malformed */ } };
    this.ws.onclose = (e) => {
      this._promise([]); // whatever was promised was promised to that connection
      if (this.closed) return;
      // 1008 is the relay refusing this very connection (a room code it will not take, or a Founder ID that another connection bound first in this room): the same address is refused again, so it is not asked again
      if (e && e.code === 1008) { this.state = 'refused'; this.reason = e.reason || ''; this.onstate?.(this.state); return; }
      this.state = 'reconnecting'; this.onstate?.(this.state);
      setTimeout(() => this.open(), Math.min(15000, 800 * 2 ** this.tries++));
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch { /* already closed */ } };
  }
  /** The relay's welcome (a frame that is the relay's own, so it has no sender): the message types it takes from this client. It is the transport's: no handler hears it. True when the frame was one. */
  _welcome(m) {
    if (!m || typeof m !== 'object' || m.t !== 'welcome' || m.from !== undefined) return false;
    this._promise(Array.isArray(m.caps) ? m.caps : []);
    return true;
  }
  _promise(list) {
    const caps = new Set(list.filter((c) => typeof c === 'string' && /^[a-z]{1,12}$/.test(c)).slice(0, 8));
    if (caps.size === this.caps.size && [...caps].every((c) => this.caps.has(c))) return;
    this.caps = caps; this.oncaps?.(caps);
  }
  send(m) {
    if (this.state === 'refused') return; // nobody is listening
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
    this.transport.oncaps = (c) => this.oncaps?.(c);
  }
  get kind() { return this.transport.kind; }
  get state() { return this.transport.state; }
  /** The message types the relay has promised to take from this room's connection (a Set of words; empty over a browser's own tabs, on a relay of before presence, and while the connection is down). */
  get caps() { return this.transport.caps; }
  can(type) { return this.transport.caps.has(type); }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  /** Presence (`here`, `act`) is sent only where the relay promised to take it: elsewhere it is not an error, it is nothing. Everything else is sent as it always was. */
  send(msg) {
    if ((msg.t === 'here' || msg.t === 'act') && !this.can(msg.t)) return;
    this.transport.send({ ...msg, from: this.pid, role: this.role, handle: this.handle, ts: Date.now() });
  }
  close() { try { this.send({ t: 'bye' }); } catch { /* noop */ } this.transport.close(); }
}
