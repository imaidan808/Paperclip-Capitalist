#!/usr/bin/env node
// The nine cameras of the author's screenshots of 2026-11-04 (the folder "Visual Bugs"), drawn the same way every time, so that a change to the roads, the districts or the grade can be shown on the very pictures the author sent:
// a "before" for every pull request that touches them, and the same camera "after". Run by hand, like the repo's other Chrome scripts (world-shots.mjs, world-budget.mjs); not in CI.
//
//   node scripts/world-author-shots.mjs --out DIR [--only 1,2,3] [--hour 8] [--lite | --no-lite] [--raw] [--dsf 2] [--cdp 9561] [--base URL | --repo DIR]
//   node scripts/world-author-shots.mjs --cam NAME:X,Y,ZOOM[,HOUR[,CROPW,CROPH]] --out DIR      a camera of your own, in world pixels (may repeat; with --cam alone only those are drawn)
//   node scripts/world-author-shots.mjs --list          the nine cameras, one a line, and stop (no browser)
//
//   --out DIR     where the PNGs and manifest.json go (made if missing): n.png is camera n, cut from the middle of the canvas to the size of the author's screenshot (its `crop`, in device pixels)
//   --only 1,2    which cameras (default all nine)
//   --hour H      light every shot for clock hour H (0 to 23; the game's clock starts at 8, plain day to 16, evening 17 to 19, night 20 to 03) instead of the hour each screenshot was taken at (tests/fixtures/author-cameras.json)
//   --lite        draw every shot as the governor's tier 3 does (no small props below zoom 0.6, no swash); --no-lite as tier 0. By default each shot has the tier its screenshot had (3 to 6 and 3 were taken in lite)
//   --raw         also keep n.full.png, the whole canvas the crop was cut from
//   --dsf 2       the canvas density (the world's canvas is pinned to min(dsf, 2), so a software-drawn headless canvas, which the game would cap at 1.5, draws what a GPU Mac draws)
//   --base URL    draw an app that is already served (default: this checkout is served by this process on a free port); --repo DIR serves another checkout instead (a worktree of the commit before, for the "before" of a change)
//   --open 2-16   the districts that are open in the game state (default: the author's, 2 to 12, so the road to 13 is drawn locked as in screenshots 1 and 3 and 13 to 16 lie under cloud); `--open all` opens every district, for a camera over 13 to 16
//   --cam n:x,y,z a camera of your own: x and y in world pixels (sx, sy of a grid point at its height; the middle of the picture), z the zoom, an hour (default 8) and a crop in device pixels (default the whole canvas)
//   --cdp 9561    the Chrome debugging port
//
// The cameras are tests/fixtures/author-cameras.json (district, world position, zoom 0.57 to 0.63, the hour, the tier, the size of the screenshot); tests/world-author-cameras.test.mjs holds the table to the island.
// How it is made repeatable (the recipe of scripts/world-shots.mjs): the game is started through the real draft screen with Math.random seeded and Date.now frozen just before Begin; the world's frame loop is stopped; sprites, ground
// chunks and light layers are built at once; the clock is pinned (pc.world.t = pc.world.vt = 1200000 ms); the districts the author had open (2 to 12) are opened through the engine's own _openZone, which gives each four buyers and
// four lots, and the game is advanced 3 hours so they are about; each picture is drawn by hand with pc.world.draw() until three draws in a row give the same pixels. The world canvas only: no HUD, no dock.
// What it does not control: the Chrome build and its raster, the system fonts the labels are drawn in, and the author's own save (their cash, stock, hour and districts).
// Hygiene: one headless Chrome, started under the nice level this process has (run it with nice -n 10); at the end the Chrome and every helper of its profile are killed BY PID (the profile folder is this run's own), never by name.
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/author-cameras.json'), 'utf8'));
const repoArg = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : null, REPO = repoArg && !repoArg.startsWith('--') ? resolve(repoArg) : ROOT; // the checkout that is drawn (this one, or --repo's)
const argv = process.argv.slice(2), has = (k) => argv.includes('--' + k), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };

const only = arg('only', null) ? String(arg('only')).split(',').map(Number) : null;
const own = argv.flatMap((a, i) => (a === '--cam' && argv[i + 1] ? [argv[i + 1]] : [])).map((spec) => { // an ad hoc camera: name:x,y,zoom[,hour[,cropW,cropH]]
  const [name, rest = ''] = spec.split(':'), [x, y, z, hour = 8, cw = 0, ch = 0] = rest.split(',').map(Number);
  if (!name || ![x, y, z].every(Number.isFinite)) { console.error(`--cam wants NAME:X,Y,ZOOM[,HOUR[,CROPW,CROPH]], not "${spec}"`); process.exit(2); }
  return { n: name, district: 0, world: [x, y], zoom: z, hour, lite: false, crop: [cw || 99999, ch || 99999], defects: [], what: 'a camera of your own' };
});
const chosen = [...(own.length && !only ? [] : FIXTURE.cameras.filter((c) => !only || only.includes(c.n))), ...own];
for (const n of only || []) if (!FIXTURE.cameras.some((c) => c.n === n)) { console.error(`there is no camera ${n}: the cameras are ${FIXTURE.cameras.map((c) => c.n).join(', ')}`); process.exit(2); }
if (has('list')) { for (const c of chosen) console.log(`${String(c.n).padEnd(3)} district ${String(c.district).padEnd(3)}world ${c.world.map((v) => v.toFixed(1)).join(', ').padEnd(16)}zoom ${c.zoom.toFixed(3)}  hour ${String(c.hour).padEnd(6)}${c.lite ? 'lite' : 'full'}  ${c.what}`); process.exit(0); }
const out = arg('out', ''); if (!out || out === true) { console.error('usage: node scripts/world-author-shots.mjs --out DIR [--only 1,2,3] [--hour 8] [--lite | --no-lite] [--raw] [--dsf 2] [--cdp 9561] [--base URL]   (see the head of this file; --list shows the cameras)'); process.exit(2); }
const openSpec = arg('open', null), OPEN = openSpec === null ? FIXTURE.open : openSpec === 'all' ? Array.from({ length: 15 }, (_, i) => i + 2) : String(openSpec).split(',').flatMap((x) => { const m = x.match(/^(\d+)-(\d+)$/); return m ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i) : [+x]; }).filter((z) => z >= 2 && z <= 16);
const OUT = resolve(String(out)), DSF = +arg('dsf', FIXTURE.dsf), CDP = +arg('cdp', 9561), [VW, VH] = FIXTURE.window, KEEP_FULL = has('raw'), HOUR = arg('hour', null) === null ? null : +arg('hour'), LITE = has('lite') ? true : has('no-lite') ? false : null;
mkdirSync(OUT, { recursive: true });
const profiles = mkdtempSync(join(tmpdir(), 'pc-author-shots-')); process.env.CHROME_PROFILES = profiles; // so every Chrome process of this run has this folder in its command line
const { startApp, quiet } = await import('./boot.mjs');

// ------------------------------------------------------------------------------------------------------------------------------ the page's side
// Everything below runs in the page. It touches only the world's own presentation state (the frame loop, clocks, the canvas density) and opens districts through the engine's own method.
const PAGE = String.raw`(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = (window.__rig = {});
  const fnv = (u) => { let h = 0x811c9dc5 | 0; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
  R.canvasHash = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; return fnv(new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2)); };
  const mk = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  R.seed = 1;
  R.draw = () => { Math.random = mk(R.seed); pc.world.draw(); };        // the same random numbers before every draw: a build that (against its own rules) draws with Math.random still draws one picture
  R.gameHourOf = (clockHour) => (((clockHour - 8) % 24) + 24) % 24;       // the sun's hour is (game hour + 8) % 24
  R.light = (clockHour, T) => {                                           // pin the hour the world reads and let night and dusk converge (they approach their targets at a limited rate)
    const w = pc.world, gh = R.gameHourOf(clockHour);
    w.hourF = () => gh; w.env.hour = gh;
    for (let i = 0; i < 90; i++) { w.t = 1e6 + i * 100; w.update(0.1); }
    w.fx.clear(); w.reveal = {}; w.t = w.vt = w.env.t = T;
    return { night: +w.night.toFixed(3), dusk: +w.dusk.toFixed(3) };
  };
  R.freeze = async (o) => {
    const w = pc.world, html = document.documentElement;
    R.seed = o.seed;
    w.stop();                                                             // no frame loop: nothing changes except by hand
    const SP = await import('/js/world/sprites.js'); SP.setBuildBudget(1e9, 6, 100); SP.setSpriteFade?.(0);
    w.gcBudget = [1e9, 1e9]; w.gcRest = 0; w.gcFade = 0;                  // every chunk of a view is baked in its first draw
    if (o.dpr) { w.targetDpr = () => o.dpr; w.resize(); }                 // pin the canvas density
    if (w.light) w.light.perFrame = 99;                                   // every light layer in the first draw
    const before = html.dataset.motion; html.dataset.motion = 'reduce';   // walk everything to where it is going (the calm path moves fast and makes no dust)
    for (let i = 0; i < 600; i++) { w.t = 1e6 + i * 100; w.update(0.1); }
    if (before === undefined) delete html.dataset.motion; else html.dataset.motion = before;
    for (const e of w.ents.values()) if (e.type === 'lead' && e.tx != null) { e.x = e.tx; e.y = e.ty; e.moving = false; }
    const lit = R.light(o.hour, o.t);
    w.t = w.vt = w.env.t = o.t;
    return { ...lit, W: w.W, H: w.H, dpr: w.dpr, cvw: w.cv.width, cvh: w.cv.height, zoomRange: w.zoomRange(), fit: w.fitZoom(), unlocked: [...(w.unlocked || [])], ents: w.ents.size };
  };
  R.open = (zones, o) => {
    const w = pc.world, g = pc.S.game; for (const z of zones) g._openZone(z);
    w.sync(); w.reveal = {}; w.fx.clear(); w.dirty = true;
    for (const e of w.ents.values()) if (e.type === 'lead' && e.tx != null) { e.x = e.tx; e.y = e.ty; e.moving = false; }
    return R.light(o.hour, o.t);
  };
  // draw until three draws in a row give the same pixels; then cut the crop (device pixels, from the middle of the canvas) and answer it as a PNG data URL
  R.shoot = async (s, o) => {
    const w = pc.world;
    R.light(s.hour, o.t);
    if (s.lite) { w.slow = 3; w.lite = true; } else { w.slow = 0; w.lite = false; }
    w.goTo(s.x, s.y, s.z, false);
    w.dirty = true; w.t = w.vt = w.env.t = o.t;
    R.draw(); await sleep(130);                                           // the first draw tells the sprite cache the zoom has changed; it builds nothing until the zoom has rested
    let prev = '', same = 0, n = 1, h = '';
    while (n < o.maxDraws) { R.draw(); n++; h = R.canvasHash(w.cv); if (h === prev) same++; else same = 0; prev = h; if (same >= 2 && n >= 4) break; }
    const cv = w.cv, cw = Math.min(cv.width, s.cw || cv.width), ch = Math.min(cv.height, s.ch || cv.height), x0 = Math.round((cv.width - cw) / 2), y0 = Math.round((cv.height - ch) / 2);
    const o2 = document.createElement('canvas'); o2.width = cw; o2.height = ch; o2.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
    const info = { draws: n, stable: same >= 2, hash: h, cam: { x: w.cam.x, y: w.cam.y, z: w.cam.z }, canvas: { w: cv.width, h: cv.height, dpr: w.dpr, css: [w.W, w.H] }, night: +w.night.toFixed(3), dusk: +w.dusk.toFixed(3), lite: !!w.lite, slow: w.slow, farMix: +(w.env.farMix ?? 0).toFixed(3) };
    return { png: o2.toDataURL('image/png'), full: s.full ? cv.toDataURL('image/png') : undefined, info };
  };
})()`;
const seedJS = (seed, wall) => `(() => { let a = ${seed >>> 0}; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; Date.now = () => ${wall}; })();`;
/** Every process of this run's Chrome (its profile folder is in the command line of the browser and of each of its helpers), by PID. */
const killMine = () => { try { for (const line of execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) { const m = line.trim().match(/^(\d+)\s+(.*)$/); if (m && +m[1] !== process.pid && m[2].includes(profiles)) { try { process.kill(+m[1], 'SIGKILL'); } catch { /* gone */ } } } } catch { /* no ps */ } };

// ------------------------------------------------------------------------------------------------------------------------------ run
let server = null, app = null;
const done = () => { try { app?.close(); } catch { /* already gone */ } killMine(); try { server?.close(); } catch { /* not listening */ } setTimeout(() => { try { rmSync(profiles, { recursive: true, force: true }); } catch { /* left */ } process.exit(process.exitCode || 0); }, 900); };
process.on('SIGINT', () => { done(); });
try {
  let base = arg('base', null);
  if (!base || base === true) { const { handler } = await import(pathToFileURL(join(REPO, 'server/static.mjs')).href); server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); base = `http://127.0.0.1:${server.address().port}`; }
  app = await startApp({ base: String(base), w: VW, h: VH, cdp: CDP, dsf: DSF });
  const { p } = app;
  for (let i = 0; i < 80 && !(await p.eval(`[...document.querySelectorAll('button')].some(b=>/Play solo/i.test(b.textContent))`)); i++) await p.sleep(250); // the title screen
  await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
    for (const id of ['trades','pro']) { const cb=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value===id||c.closest('label,article,div')?.textContent.toLowerCase().includes(id)); cb?.click(); await wait(100); }
    ${seedJS(FIXTURE.seed, 1767225600000)}
    [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); })()`);
  for (let i = 0; i < 60 && !(await p.eval('!!(window.pc && pc.world && pc.world.unlocked)')); i++) await p.sleep(250);
  if (!(await p.eval('!!(window.pc && pc.world && pc.world.unlocked)'))) throw new Error('the world did not come up (is --base serving the app?)');
  await quiet(p);
  await p.eval(`(()=>{ const g = pc.S.game; g.s.pid = 'PC-RIG0'; g.s.handle = 'Rig'; pc.S.handle = 'Rig'; g.advanceTo(${FIXTURE.gameHours}); pc.S.emit('change'); })()`);
  await quiet(p);
  await p.eval(PAGE);
  const o = { seed: FIXTURE.seed ^ 0x5bd1e995, dpr: Math.min(2, DSF), hour: HOUR ?? chosen[0]?.hour ?? 8, t: FIXTURE.t, maxDraws: 24 };
  const manifest = { script: 'world-author-shots.mjs', startedAt: new Date().toISOString(), git: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + (execSync('git status --porcelain js css index.html', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '+changes' : ''); } catch { return null; } })(), options: { hour: HOUR, lite: LITE, dsf: DSF, window: [VW, VH], seed: FIXTURE.seed, t: FIXTURE.t, gameHours: FIXTURE.gameHours, open: OPEN }, shots: [] };
  manifest.world = await p.eval(`__rig.freeze(${JSON.stringify(o)})`);
  manifest.opened = await p.eval(`__rig.open(${JSON.stringify(OPEN)}, ${JSON.stringify(o)})`);
  manifest.world.unlockedAfter = await p.eval('[...pc.world.unlocked]');
  for (const c of chosen) {
    const hour = HOUR ?? c.hour, lite = LITE ?? c.lite, spec = { x: c.world[0], y: c.world[1], z: c.zoom, hour, lite, cw: c.crop[0], ch: c.crop[1], full: KEEP_FULL };
    const r = await p.eval(`__rig.shoot(${JSON.stringify(spec)}, ${JSON.stringify(o)})`);
    const png = Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'); writeFileSync(join(OUT, `${c.n}.png`), png);
    if (r.full) writeFileSync(join(OUT, `${c.n}.full.png`), Buffer.from(r.full.slice(r.full.indexOf(',') + 1), 'base64'));
    manifest.shots.push({ name: String(c.n), district: c.district, hour, lite, requested: { world: c.world, zoom: c.zoom, crop: c.crop }, ...r.info, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex').slice(0, 16), defects: c.defects, what: c.what });
    console.log(`${String(c.n).padEnd(3)} district ${String(c.district).padEnd(3)}cam ${Math.round(r.info.cam.x)},${Math.round(r.info.cam.y)} z ${r.info.cam.z.toFixed(3)}  hour ${hour}  night ${r.info.night} dusk ${r.info.dusk}  ${lite ? 'lite' : 'full'}  draws ${r.info.draws}${r.info.stable ? '' : ' UNSTABLE'}  ${r.info.hash}`);
  }
  manifest.errors = p.logs.filter((l) => /error|EXC|warn/i.test(l)).slice(0, 20);
  manifest.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  if (manifest.shots.some((s) => !s.stable)) { console.error('some pictures did not settle (the same pixels three draws in a row): a build that draws something different each time is the thing to fix before comparing pictures'); process.exitCode = 1; }
} catch (e) { console.error(e); process.exitCode = 1; } finally { done(); }
