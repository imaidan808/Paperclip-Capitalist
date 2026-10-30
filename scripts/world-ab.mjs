// Side-by-side pictures of two folders of world shots, labelled, so a before and an after can be read at a glance.
//
//   node scripts/world-ab.mjs BEFORE_DIR AFTER_DIR OUT_DIR [options]
//
// Options:
//   --only a,b            only these shots (default: every shot that is in both folders)
//   --before-label TEXT   the label over the left half (default: "BEFORE" and the build in BEFORE_DIR/manifest.json, e.g. main adcd991)
//   --after-label TEXT    the label over the right half (default: "AFTER" and the build)
//   --w 1440 --h 900      the size of each half in pixels (a shot of another size is fitted inside it, never stretched)
//   --thumb 480           the width of one half in the contact sheet; --cols 3 pairs a row
//   --cdp 9503            the Chrome debugging port (the pictures are composed in a headless Chrome's canvas; it is killed at the end)
//
// Writes OUT_DIR/ab-NAME.png for each shot (two halves side by side, a label bar over them naming the build, the shot and its camera), OUT_DIR/contact-sheet.png (every pair as thumbnails
// in a grid, each named), OUT_DIR/index.html (all of them on one page) and OUT_DIR/index.json. Only Node and Chrome: Chrome draws, Node serves the two folders on a local port and saves what comes back.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { launch, open } from './cdp.mjs';

const argv = process.argv.slice(2), pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) i++; else pos.push(argv[i]); }
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [BEFORE, AFTER, OUT] = pos;
if (!BEFORE || !AFTER || !OUT) { console.error('usage: node scripts/world-ab.mjs BEFORE_DIR AFTER_DIR OUT_DIR [--only a,b] [--before-label T] [--after-label T] [--w 1440 --h 900] [--thumb 480 --cols 3] [--cdp 9503]'); process.exit(2); }
const W = +arg('w', 1440), H = +arg('h', 900), THUMB = +arg('thumb', 480), COLS = +arg('cols', 3), CDP = +arg('cdp', 9503), only = arg('only', null) ? new Set(String(arg('only')).split(',')) : null;
for (const d of [BEFORE, AFTER]) if (!existsSync(d)) { console.error('no such folder: ' + d); process.exit(2); }
const manifest = (d) => { try { return JSON.parse(readFileSync(`${d}/manifest.json`, 'utf8')); } catch { return null; } };
const mb = manifest(BEFORE), ma = manifest(AFTER);
const shots = (d) => readdirSync(d).filter((f) => f.endsWith('.png') && !f.endsWith('.full.png')).map((f) => f.slice(0, -4));
const inAfter = new Set(shots(AFTER)), order = (ma?.shots || mb?.shots || []).map((s) => s.name);
let names = shots(BEFORE).filter((n) => inAfter.has(n) && (!only || only.has(n)));
names.sort((a, b) => (order.indexOf(a) < 0 ? 1e6 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 1e6 : order.indexOf(b)) || a.localeCompare(b));
if (!names.length) { console.error('no shot is in both folders'); process.exit(1); }
const skipped = { onlyBefore: shots(BEFORE).filter((n) => !inAfter.has(n)), onlyAfter: shots(AFTER).filter((n) => !shots(BEFORE).includes(n)) };
mkdirSync(OUT, { recursive: true });
const tag = (m, side) => `${side}${m?.git ? '  ' + m.git : ''}`;
const labelB = String(arg('before-label', null) ?? tag(mb, 'BEFORE')), labelA = String(arg('after-label', null) ?? tag(ma, 'AFTER'));
const camText = (m, n) => { const s = m?.shots?.find((x) => x.name === n); return s ? `${s.requested?.fit ? 'fit' : 'cam ' + Math.round(s.cam.x) + ',' + Math.round(s.cam.y)}  z ${s.cam.z.toFixed(2)}  hour ${s.hour}  ${s.canvas.w}x${s.canvas.h}` : ''; };

// a server for the two folders, so the page can load their pictures without tainting its canvas
const TYPES = { '.png': 'image/png', '.html': 'text/html' };
const server = createServer((req, res) => {
  const [, side, file] = req.url.split('?')[0].split('/'); // /b/NAME.png, /a/NAME.png
  if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset=utf-8><title>ab</title><body style="margin:0;background:#111">'); return; }
  const dir = side === 'b' ? BEFORE : side === 'a' ? AFTER : null, f = file ? basename(decodeURIComponent(file)) : '';
  if (!dir || !/^[\w.-]+\.png$/.test(f) || !existsSync(`${dir}/${f}`)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(`${dir}/${f}`));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const PAGE = String.raw`(() => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('cannot load ' + u)); i.src = u; });
  const fit = (g, img, x, y, w, h) => { const k = Math.min(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * k, dh = img.naturalHeight * k; g.fillStyle = '#0b0f14'; g.fillRect(x, y, w, h); g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); };
  window.pair = async (name, o) => {
    const [b, a] = await Promise.all([load('/b/' + name + '.png'), load('/a/' + name + '.png')]);
    const BAR = 54, cv = document.createElement('canvas'); cv.width = o.w * 2 + 4; cv.height = o.h + BAR; const g = cv.getContext('2d');
    g.fillStyle = '#10151c'; g.fillRect(0, 0, cv.width, BAR);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    fit(g, b, 0, BAR, o.w, o.h); fit(g, a, o.w + 4, BAR, o.w, o.h);
    g.fillStyle = '#ffd36e'; g.fillRect(o.w, BAR, 4, o.h);
    g.textBaseline = 'alphabetic';
    for (const [x, label, cam, accent] of [[0, o.labelB, o.camB, '#7fb8ff'], [o.w + 4, o.labelA, o.camA, '#ffd36e']]) {
      g.fillStyle = accent; g.font = '600 22px ui-monospace, Menlo, monospace'; g.fillText(label, x + 14, 24);
      g.fillStyle = '#e8edf3'; g.font = '500 16px ui-monospace, Menlo, monospace'; g.fillText(name, x + 14, 46);
      g.fillStyle = '#8fa0b3'; g.fillText(cam, x + 14 + g.measureText(name + '   ').width, 46);
    }
    const url = cv.toDataURL('image/png'); cv.width = cv.height = 1; return url;
  };
  window.sheet = async (names, o) => {
    const cw = o.thumb * 2 + 6, th = Math.round(o.thumb * o.h / o.w), LAB = 24, rows = Math.ceil(names.length / o.cols), cv = document.createElement('canvas');
    cv.width = cw * o.cols; cv.height = (th + LAB) * rows; const g = cv.getContext('2d'); g.fillStyle = '#10151c'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    for (let i = 0; i < names.length; i++) {
      const x = (i % o.cols) * cw, y = Math.floor(i / o.cols) * (th + LAB), [b, a] = await Promise.all([load('/b/' + names[i] + '.png'), load('/a/' + names[i] + '.png')]);
      fit(g, b, x, y + LAB, o.thumb, th); fit(g, a, x + o.thumb + 6, y + LAB, o.thumb, th);
      g.fillStyle = '#e8edf3'; g.font = '600 15px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle'; g.fillText(names[i], x + 8, y + LAB / 2);
      g.fillStyle = '#7fb8ff'; g.fillText('before', x + o.thumb - 62, y + LAB / 2); g.fillStyle = '#ffd36e'; g.fillText('after', x + o.thumb + 6 + o.thumb - 50, y + LAB / 2);
    }
    return cv.toDataURL('image/png');
  };
})()`;

const b = await launch(CDP);
const done = () => { try { b.close(); } catch { /* gone */ } try { server.close(); } catch { /* closed */ } };
process.on('SIGINT', () => { done(); process.exit(130); });
const save = (file, url) => writeFileSync(`${OUT}/${file}`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
try {
  const p = await open(b, `http://127.0.0.1:${port}/`, { w: 400, h: 300, dsf: 1 });
  await p.eval(PAGE);
  const index = [];
  for (const n of names) {
    const url = await p.eval(`window.pair(${JSON.stringify(n)}, ${JSON.stringify({ w: W, h: H, labelB, labelA, camB: camText(mb, n), camA: camText(ma, n) })})`);
    save(`ab-${n}.png`, url); index.push({ name: n, file: `ab-${n}.png`, before: camText(mb, n), after: camText(ma, n) });
    console.log(`ab-${n}.png`);
  }
  save('contact-sheet.png', await p.eval(`window.sheet(${JSON.stringify(names)}, ${JSON.stringify({ w: W, h: H, thumb: THUMB, cols: COLS })})`));
  writeFileSync(`${OUT}/index.json`, JSON.stringify({ before: BEFORE, after: AFTER, labelB, labelA, shots: index, skipped }, null, 1));
  writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>${labelB} against ${labelA}</title><style>body{margin:0;background:#0b0f14;color:#e8edf3;font:14px ui-monospace,Menlo,monospace}h1{font-size:16px;margin:12px 16px}img{display:block;width:100%;max-width:2884px;margin:0 0 18px}</style><h1>${labelB} | ${labelA}</h1><a href="contact-sheet.png"><img src="contact-sheet.png" alt="contact sheet"></a>${index.map((s) => `<img src="${s.file}" alt="${s.name}" loading="lazy">`).join('')}`);
  console.log(`\n${names.length} pairs and contact-sheet.png in ${OUT}${skipped.onlyBefore.length || skipped.onlyAfter.length ? `\nnot in both: before only ${skipped.onlyBefore.join(', ') || '-'}; after only ${skipped.onlyAfter.join(', ') || '-'}` : ''}`);
} catch (e) { console.error(e); process.exitCode = 1; } finally { done(); setTimeout(() => process.exit(process.exitCode || 0), 700); }
