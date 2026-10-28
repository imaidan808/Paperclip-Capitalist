// Zero-dependency static file server for local play: `npm start` then open http://localhost:8080
// It serves the app and nothing else: index.html, css/, js/, docs/, dev/ and tests/ (the screenshot and performance drivers import tests/bot.mjs from the page).
// Never a dotfile or a dot folder (.git, .github), never node_modules, never server/ or the package files. It listens on this machine only (HOST=0.0.0.0 to share a lab).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const DIRS = new Set(['css', 'js', 'docs', 'dev', 'tests']);

/** The file a request asks for, relative to the root: { file } or { status } (400 for a request that makes no sense, 404 for one that is not the app's). Pure. */
export function route(url) {
  if (typeof url !== 'string' || url[0] !== '/') return { status: 400 };
  let path;
  try { path = decodeURIComponent(url.split(/[?#]/, 1)[0]); } catch { return { status: 400 }; }
  if (path.includes('\0') || path.includes('\\')) return { status: 400 };
  const parts = path.split('/').filter(Boolean);
  if (parts.some((p) => p === '..' || p.startsWith('.') || p === 'node_modules')) return { status: 404 };
  if (!parts.length) parts.push('index.html');       // the front page; a folder is not a page
  else if (path.endsWith('/')) return { status: 404 };
  if (parts.length === 1 ? parts[0] !== 'index.html' : !DIRS.has(parts[0])) return { status: 404 };
  const file = parts.join('/');
  return types[extname(file)] ? { file } : { status: 404 };
}

export async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end('method not allowed'); return; }
    const r = route(req.url);
    if (r.status) { res.writeHead(r.status); res.end(r.status === 400 ? 'bad request' : 'not found'); return; }
    const full = join(root, r.file);
    if (full !== root && !full.startsWith(root + sep)) { res.writeHead(404); res.end('not found'); return; }
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': types[extname(r.file)], 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('not found');
  }
}

// started by `node server/static.mjs`; importing the module (the tests do) starts nothing
const isMain = () => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (process.argv[1] && isMain()) {
  const port = process.env.PORT != null && process.env.PORT !== '' ? +process.env.PORT : 8080, host = process.env.HOST || '127.0.0.1';
  const server = createServer(handler);
  server.on('clientError', (_e, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* gone */ } });
  server.listen(port, host, () => console.log(`http://localhost:${server.address().port}`));
}
