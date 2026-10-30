// Hosting the game for a class from the GitHub Pages address: the page is static, so students on other devices reach each other through the relay (server/relay.mjs), which runs somewhere else (docs/HOSTING.md).
//   - cleanRelay: what an instructor pastes (the https address a host gives them, a bare host name) becomes the WebSocket address the browser needs, and nothing that is not an address gets through
//   - the relay address the page starts with: the link's, the one this browser kept, then DEFAULT_RELAY of js/config.js (empty until a relay is hosted); the session cleans it whichever way it came in
//   - the packaging: the relay is one file with one dependency, and the files that run it on a free host say how
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanRelay } from '../js/net.js';
import { DEFAULT_RELAY } from '../js/config.js';
import { Session } from '../js/session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('H1: cleanRelay makes the WebSocket address of what a person pastes: https becomes wss, http becomes ws, a bare host name is wss (ws for a machine in the lab), and nothing that is not an address gets through', () => {
  const is = (raw, want) => assert.equal(cleanRelay(raw), want, JSON.stringify(raw));
  is('wss://relay.example.edu', 'wss://relay.example.edu'); is('  wss://relay.example.edu/  ', 'wss://relay.example.edu'); is('WSS://Relay.Example.edu', 'wss://relay.example.edu');
  is('https://paperclip-relay.onrender.com', 'wss://paperclip-relay.onrender.com'); is('https://paperclip-relay.onrender.com/', 'wss://paperclip-relay.onrender.com'); is('http://relay.example.edu:8787', 'ws://relay.example.edu:8787');
  is('paperclip-relay.onrender.com', 'wss://paperclip-relay.onrender.com'); is('relay.example.edu/pc', 'wss://relay.example.edu/pc');
  for (const lab of ['localhost:8787', '127.0.0.1:8787', '192.168.1.20:8787', '10.0.0.5', '172.20.1.2:8787', 'lab-pc.local:8787', 'relay.lan']) is(lab, 'ws://' + lab);
  is('ws://localhost:8787', 'ws://localhost:8787');
  is('wss://relay.example.edu/pc?room=x', 'wss://relay.example.edu/pc?room=x'); // a path and a query stay (a relay behind a proxy), a fragment does not
  is('wss://relay.example.edu/#frag', 'wss://relay.example.edu');
  for (const nothing of ['', '   ', undefined, null]) is(nothing, '');
  for (const bad of ['hello world', 'ftp://x.example.com', 'javascript:alert(1)', 'data:text/html,hi', 'wss://', 'https://', '//evil.example.com', 'wss://a b.example.com', 'file:///etc/passwd', 'not_a_host', '12345', 42, {}]) is(bad, '');
});

test('H2: the relay address the page starts with is the link\'s, then the one this browser kept, then DEFAULT_RELAY; and the session cleans an address whichever way it came in, so a pasted https address works', () => {
  assert.equal(typeof DEFAULT_RELAY, 'string'); assert.equal(cleanRelay(DEFAULT_RELAY), DEFAULT_RELAY, 'a default relay is written as the address the browser needs (wss://...), or left empty');
  assert.match(read('js/main.js'), /params\.get\('relay'\) \|\| kv\.get\('relay'\) \|\| DEFAULT_RELAY/, 'the title screen falls back to the default relay');
  assert.match(read('js/main.js'), /relayOf\(\$\('#jr'\)\.value\)/, 'the join form cleans what is typed (and says so when it is not an address)'); assert.match(read('js/main.js'), /relayOf\(\$\('#ir'\)\.value\)/, 'so does the instructor\'s'); assert.match(read('js/ui/shell.js'), /relayOf\(/, 'and so does the dialog of a game in progress');
  const s = new Session(); s.pid = 'PC-CLEAN'; s.joinRoom({ code: 'HOST1', relay: '', role: 'student', handle: 'x' }); assert.equal(s.roomInfo.relay, '', 'no relay: a room between the tabs of this browser');
  s.leaveRoom();
  const calls = []; const real = globalThis.WebSocket; globalThis.WebSocket = class { constructor(u) { calls.push(u); this.readyState = 0; } close() {} send() {} };
  try { s.joinRoom({ code: 'HOST2', relay: ' https://paperclip-relay.onrender.com/ ', role: 'student', handle: 'x' }); } finally { globalThis.WebSocket = real; }
  assert.equal(s.roomInfo.relay, 'wss://paperclip-relay.onrender.com', 'the address the room keeps (and the student link carries) is the cleaned one');
  assert.ok(calls.length >= 1 && calls[0].startsWith('wss://paperclip-relay.onrender.com?room=HOST2'), 'and the socket is opened on it: ' + calls[0]); s.leaveRoom();
});

test('H3: the relay is one file with one dependency (ws), so any free host that runs node can run it, and the files that say how are in the repository', () => {
  const imports = [...read('server/relay.mjs').matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 3 && imports.every((m) => m === 'ws' || m.startsWith('node:')), `the relay imports ${imports.join(', ')}`);
  assert.deepEqual(Object.keys(JSON.parse(read('server/package.json')).dependencies), ['ws']); assert.match(read('server/package.json'), /"start": "node relay\.mjs"/);
  const render = read('render.yaml'); for (const need of ['type: web', 'runtime: node', 'plan: free', 'rootDir: server', 'buildCommand: npm ci', 'startCommand: npm start', 'healthCheckPath: /health']) assert.ok(render.includes(need), `render.yaml has ${need}`);
  const docker = read('Dockerfile'); for (const need of ['FROM node:', 'npm ci --omit=dev', 'relay.mjs', 'EXPOSE', 'USER node']) assert.ok(docker.includes(need), `the Dockerfile has ${need}`);
  assert.ok(existsSync(join(ROOT, '.dockerignore')) && /node_modules/.test(read('.dockerignore')), 'the image does not take the folder\'s node_modules');
  const doc = read('docs/HOSTING.md'); for (const need of ['GitHub Pages', 'render.yaml', 'wss://', '/health', 'DEFAULT_RELAY', 'sleeps', 'recovery code']) assert.ok(doc.includes(need), `docs/HOSTING.md says ${need}`);
});
