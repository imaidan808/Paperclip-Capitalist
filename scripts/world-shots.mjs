// Deterministic pictures of the world, so the whole team can compare a build before and after, pixel for pixel.
//
//   PORT=8503 node server/static.mjs &                       (serve the worktree you want to photograph)
//   node scripts/world-shots.mjs --base http://localhost:8503 --out /tmp/shots-after [options]
//
// Options (all optional except --out):
//   --base URL        the served app (default http://localhost:8090)
//   --out DIR         where the PNGs and manifest.json go (made if missing)
//   --dsf 2           device scale factor of the page; the world canvas is pinned to it (min(dsf, 2)), so a headless Chrome whose canvas is CPU-drawn (and which the game would cap at 1.5) draws what a GPU Mac draws.
//                     --canvas-dpr app keeps the game's own choice instead
//   --w 1440 --h 900  the window in css pixels
//   --set all|quick|pan|tod|extent|NAME,NAME   which shots (default all: the 27 of the baseline). quick: island-far, start-mid, coast-west, sea-open, fog-near, start-close. tod: the three scenes at hours 8, 13, 19 and 23.
//                     pan: the same sea seen from two cameras 300 by 160 css px apart, at two zooms, and from two cameras at two clock times 2 s apart (what world-metrics.mjs --anchor reads: pan, zoom and drift pairs)
//                     extent: the whole island at fit, in the world and in map mode (island-far, island-map): shoot it at --w 390 --h 844 and --w 768 --h 1024 and run world-metrics.mjs DIR --unpainted, so a sea that
//                     ends where its bitmap ends shows (an opaque canvas leaves black there). The shots marked optional (the drift pair, island-map) are in their sets only, never in `all`.
//   --hour 8          the clock hour of day (0 to 23) every shot is lit for; the game's clock is 8 at the start. The tod shots ignore it. Under --motion reduced the light is always plain day.
//   --t 1200000       the animation clock in ms every shot is drawn at (pc.world.t and vt): waves, glints, smoke, dust and the traffic stand at this moment. Change it to see another phase.
//   --motion frozen   frozen (default): the page runs normally but the world's clock is stopped at --t, so animated things are drawn at one fixed phase.
//                     reduced: the page asks for reduced motion (what a person who sets it sees: a still picture, no moving dust, always day)
//   --seed 20260101   the game's seed: Math.random is replaced by a seeded generator and Date.now frozen just before Begin, so the same build gives the same state
//   --game-hour 3     virtual hours the game is advanced before the shots (so buyers and lots are about); 0 for the bare start
//   --draws 2 --max-draws 24   a shot is drawn at least 2 times and then until three draws in a row give identical pixels (so four at the least), at most 24
//   --full            also keep NAME.full.png, the page as a person sees it (HUD, dock and buttons over the world)
//   --reverse         shoot in reverse order (a build must give the same pictures whichever order they are taken in)
//   --perf            after the shots, time a frame (pc.world.draw() and the canvas's raster) at each shot's camera, still and with the camera moving so the ground cache cannot be used, and size the offscreen bitmaps: written to perf.json
//   --list            print the names of the chosen shots, one a line, and stop (no browser)
//   --debug           also keep the entities' places in the manifest (to find what differs between two runs)
//   --cdp 9503        the Chrome debugging port (each Chrome needs its own port; it is killed at the end)
//
// What it writes: NAME.png for each shot (the canvas as it is, world pixels only, no HUD: width * dsf by height * dsf), manifest.json (the options, the build's git head, each shot's requested and actual
// camera, canvas size, number of draws, whether it settled, a hash of its pixels, and the console errors) and, with --perf, perf.json. A shot that opens a district in the game state (city-close) runs
// last; the manifest says so. A shot that did not settle (the same pixels three draws in a row) is named UNSTABLE in the output and in manifest.unstable: that is a build that draws something
// different each time, and the thing to fix before comparing pictures.
// How it is made repeatable: the game is started through the real draft screen with Math.random seeded and Date.now frozen (so seed, state and clock are fixed), the world's frame loop is stopped
// (pc.world.stop()), buyers are put on their places, and every picture is drawn by hand with pc.world.draw() at a fixed pc.world.t and light after the cameras, sprites, light layers and ground cache
// have settled (the sprite cache is allowed to build everything at once; the light layers are made in the first draw). Math.random is seeded the same way before every draw.
// What is still outside its control: the Chrome build and its raster (a new Chrome can move an antialiased edge), the system fonts the labels are drawn in, the machine's canvas (a GPU draws a pixel or two
// differently from the CPU: compare pictures made on one machine), and anything a build adds that reads the wall clock or performance.now while drawing (the rig stops the loop and fixes t and vt, not those).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startApp, quiet } from './boot.mjs';
import { LAYOUT, DIST, zAt } from '../js/world/layout.js';
import { sx, sy } from '../js/world/iso.js';

// ------------------------------------------------------------------------------------------------------------------------------ options
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const O = {
  base: String(arg('base', 'http://localhost:8090')), out: arg('out', ''), dsf: +arg('dsf', 2), w: +arg('w', 1440), h: +arg('h', 900), set: String(arg('set', 'all')), hour: +arg('hour', 8), t: +arg('t', 1200000),
  motion: String(arg('motion', 'frozen')), seed: +arg('seed', 20260101), gameHour: +arg('game-hour', 3), draws: +arg('draws', 2), maxDraws: +arg('max-draws', 24), full: !!arg('full', false), reverse: !!arg('reverse', false),
  cdp: +arg('cdp', 9503), debug: !!arg('debug', false), perf: !!arg('perf', false), canvasDpr: String(arg('canvas-dpr', 'native')), perks: String(arg('perks', 'trades,pro')),
};
if (!O.out || O.out === true) { console.error('usage: node scripts/world-shots.mjs --base http://localhost:8503 --out DIR [--dsf 2] [--set all|quick|pan|tod|names] [--hour 8] (see the head of this file)'); process.exit(2); }
if (!['frozen', 'reduced'].includes(O.motion)) { console.error('--motion is frozen or reduced'); process.exit(2); }

// ------------------------------------------------------------------------------------------------------------------------------ where the cameras stand
// Positions are world pixels (sx, sy of a grid point at a height), found from the island's own plan, so they follow it if the plan moves.
const at = (gx, gy, gz) => [sx(gx, gy), sy(gx, gy, gz ?? zAt(gx, gy))];
const atDistrict = (id, up = 20) => { const d = DIST[id]; return [sx(d.cx, d.cy), sy(d.cx, d.cy, d.z) - up]; };
let coastGx = 0; while (coastGx < 80 && !LAYOUT.isLand(coastGx, 112)) coastGx++; // the starting island's west coast along row 112: the first land tile from the sea
const COAST = at(coastGx, 112, 0), WEST_SAND = at(coastGx, 118, 0), SOUTH_SAND = at(23, 126.8, 0), LAKE = at(88, 74, 0), FERRY = at(141, 15, 0); // pale sand lies along the west coast (row 116 to 119) and the south coast (row 126)
const shift = ([x, y], dx, dy) => [x + dx, y + dy];
const SHOTS = [
  { name: 'island-far', sets: ['quick', 'extent'], fit: true },
  { name: 'island-mid', sets: [], z: 0.3, at: shift(COAST, -400, 0) },
  { name: 'coast-west', sets: ['quick'], z: 1.0, at: shift(WEST_SAND, 180, 10) },
  { name: 'sea-open', sets: ['quick'], z: 0.5, at: LAKE },
  { name: 'fog-near', sets: ['quick'], z: 0.9, at: atDistrict(3) },
  { name: 'fog-far', sets: [], z: 0.45, at: atDistrict(10) },
  { name: 'start-close', sets: ['quick'], z: 2.4, at: at(DIST[1].cx, DIST[1].cy, DIST[1].z) },
  { name: 'start-mid', sets: ['quick'], z: 1.0, at: atDistrict(1) },
  { name: 'bridge-or-ferry', sets: [], z: 1.0, at: FERRY },
  { name: 'coast-close', sets: [], z: 2.4, at: SOUTH_SAND },
  // the same scenes at four times of day (hour 8 is what the plain shots are lit for; the game's day runs 7 to 17, so 8 and 13 are the same light)
  ...[8, 13, 19, 23].flatMap((hh) => [['island-far', { fit: true }], ['start-mid', { z: 1.0, at: atDistrict(1) }], ['fog-near', { z: 0.9, at: atDistrict(3) }]].map(([n, c]) => ({ name: `tod-h${String(hh).padStart(2, '0')}-${n}`, sets: ['tod'], hour: hh, ...c }))),
  // water that must be anchored to the world: one sea from two cameras (300 by 160 css px apart) and at two zooms
  { name: 'sea-pan-a', sets: ['pan'], z: 0.5, at: LAKE },
  { name: 'sea-pan-b', sets: ['pan'], z: 0.5, at: shift(LAKE, 300 / 0.5, 160 / 0.5), panFrom: 'sea-pan-a' },
  { name: 'sea-zoom-1', sets: ['pan'], z: 0.6, at: shift(LAKE, 0, 120) },
  { name: 'sea-zoom-2', sets: ['pan'], z: 1.2, at: shift(LAKE, 0, 120), zoomFrom: 'sea-zoom-1' },
  // the same pan with the clock running: the second shot is drawn 2 s after the first (the sea may have drifted, by at most 0.1 tile a second); optional: not in `all`
  { name: 'sea-drift-a', sets: ['pan'], optional: true, z: 0.5, at: LAKE },
  { name: 'sea-drift-b', sets: ['pan'], optional: true, z: 0.5, at: shift(LAKE, 300 / 0.5, 160 / 0.5), panFrom: 'sea-drift-a', dt: 2000 },
  // the fit view in map mode (the cards and names the map draws over the island); optional
  { name: 'island-map', sets: ['extent'], optional: true, fit: true, map: true },
  // this one opens district 10 in the game state, so it always runs last
  { name: 'city-close', sets: [], z: 1.4, at: atDistrict(10), unlock: [10] },
];
const ALL = new Set(SHOTS.map((s) => s.name));
const pick = (spec) => {
  if (spec === 'all') return SHOTS.filter((s) => !s.optional);
  const want = new Set(spec.split(',').map((x) => x.trim()).filter(Boolean)), out = SHOTS.filter((s) => want.has(s.name) || s.sets.some((k) => want.has(k)));
  for (const n of want) if (!ALL.has(n) && !['quick', 'tod', 'pan', 'extent'].includes(n)) { console.error(`unknown shot or set "${n}". shots: ${[...ALL].join(', ')}`); process.exit(2); }
  return out;
};
let chosen = pick(O.set);
if (O.motion === 'reduced') chosen = chosen.filter((s) => !s.hour); // reduced motion is plain day: no time-of-day shots
const plain = chosen.filter((s) => !s.unlock), opens = chosen.filter((s) => s.unlock);
const order = [...(O.reverse ? [...plain].reverse() : plain), ...opens];
if (arg('list', false)) { console.log(order.map((s) => s.name).join('\n')); process.exit(0); } // --list: the shots the options choose, one a line, and no browser (tests/world-metrics.test.mjs holds `all` to the baseline's 27)

// ------------------------------------------------------------------------------------------------------------------------------ the page's side
// Everything below runs in the page. It touches only the world's own presentation state (the frame loop, clocks, the canvas density) and, for city-close, opens a district through the engine's own method.
const PAGE = String.raw`(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = (window.__rig = {});
  const fnv = (u) => { let h = 0x811c9dc5 | 0; for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
  R.canvasHash = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; return fnv(new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2)); };
  R.stateHash = () => { const s = JSON.stringify(pc.S.game.s); let h = 0x811c9dc5 | 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };
  const mk = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  R.seed = 1;
  R.draw = () => { Math.random = mk(R.seed); pc.world.draw(); }; // the same random numbers before every draw: a build that (against its own rules) draws with Math.random still draws one picture
  R.gameHourOf = (clockHour) => (((clockHour - 8) % 24) + 24) % 24; // the sun's hour is (game hour + 8) % 24
  // light: pin the hour the world reads and let night and dusk converge (they approach their targets at a limited rate, 0.035 a step)
  R.light = (clockHour, T) => {
    const w = pc.world, gh = R.gameHourOf(clockHour);
    w.hourF = () => gh; w.env.hour = gh;
    for (let i = 0; i < 90; i++) { w.t = 1e6 + i * 100; w.update(0.1); }
    w.fx.clear(); w.reveal = {}; w.t = w.vt = w.env.t = T;
    return { night: +w.night.toFixed(3), dusk: +w.dusk.toFixed(3) };
  };
  R.freeze = async (o) => {
    const w = pc.world, html = document.documentElement;
    R.seed = o.seed;
    w.stop();                                                  // no frame loop: nothing changes except by hand
    const SP = await import('/js/world/sprites.js'); SP.setBuildBudget(1e9, 6, 100); SP.setSpriteFade(0); // sprites are built in a few milliseconds a frame; here all at once, and an exact sprite replaces its stand-in at once (no 120 ms fade), so no picture waits on the clock
    w.gcBudget = [1e9, 1e9]; w.gcRest = 0;                                   // the ground's chunks likewise: every chunk of a view is baked in its first draw
    if (o.dpr) { w.targetDpr = () => o.dpr; w.resize(); }     // pin the canvas density (a software-drawn canvas would be capped by the game)
    if (w.light) w.light.perFrame = 99;                        // every light layer in the first draw, not one a frame
    const before = html.dataset.motion; html.dataset.motion = 'reduce'; // walk everything to where it is going (the calm path moves fast and makes no dust)
    for (let i = 0; i < 600; i++) { w.t = 1e6 + i * 100; w.update(0.1); }
    if (before === undefined) delete html.dataset.motion; else html.dataset.motion = before;
    // a buyer stops walking within 0.06 of its place, wherever the last step left it (which depends on the frame times of the real run): put each exactly on its place
    for (const e of w.ents.values()) if (e.type === 'lead' && e.tx != null) { e.x = e.tx; e.y = e.ty; e.moving = false; }
    const lit = o.reduced ? { night: 0, dusk: 0 } : R.light(o.hour, o.t);
    w.t = w.vt = w.env.t = o.t;
    const ents = [...w.ents.values()].map((e) => [e.id, e.type, e.x ?? null, e.y ?? null, e.drop ?? null, e.slot ?? null, e.moving ?? null, e.leaving ?? null, e.dir ?? null]);
    return { ...lit, entsHash: fnv(new TextEncoder().encode(JSON.stringify(ents))), entsDump: o.debug ? ents : undefined, player: { ...w.player, path: w.player.path.length }, W: w.W, H: w.H, dpr: w.dpr, cvw: w.cv.width, cvh: w.cv.height, zoomRange: w.zoomRange(), fit: w.fitZoom(), inset: { ...w.inset }, unlocked: [...(w.unlocked || [])], ents: w.ents.size };
  };
  R.unlock = (zones, o) => {
    const w = pc.world, g = pc.S.game; for (const z of zones) g._openZone(z);
    w.sync(); w.reveal = {}; w.fx.clear(); w.dirty = true;
    return R.light(o.hour, o.t);
  };
  const sum = (a) => a.reduce((x, y) => x + y, 0), pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(b.length * q))].toFixed(2); };
  const spread = (a) => ({ median: pct(a, 0.5), p95: pct(a, 0.95), max: pct(a, 1) });
  R.perf = async (s, o) => {
    const w = pc.world, S = await import('/js/world/sprites.js');
    S.clearSprites(); // so the sprite bitmaps counted are this view's own working set, not what earlier views left in the cache
    if (s.hour != null && !o.reduced) R.light(s.hour, o.t); else if (!o.reduced) R.light(o.hour, o.t);
    if (s.fit) w.fit(false); else w.goTo(s.x, s.y, s.z, false);
    w.t = w.vt = w.env.t = o.t; R.draw(); await sleep(130); for (let i = 0; i < 6; i++) R.draw();
    const still = [], pan = [], N = o.perfDraws;
    const flush = () => w.ctx.getImageData(0, 0, 1, 1); // a canvas records its commands and draws them later: reading a pixel makes it do the work now, so the time is the real cost of the frame
    for (let i = 0; i < N; i++) { const a = performance.now(); R.draw(); flush(); still.push(performance.now() - a); }
    const x0 = w.cam.x, y0 = w.cam.y;
    for (let i = 0; i < N; i++) { w.cam.x = x0 + (i % 2 ? 9 : -9) * (1 + (i >> 1) % 4) / w.cam.z; w.cam.y = y0 + (i % 3 - 1) * 5 / w.cam.z; w.dirty = true; const a = performance.now(); R.draw(); flush(); pan.push(performance.now() - a); }
    w.cam.x = x0; w.cam.y = y0;
    const px = (c) => (c ? (c.c ? c.c.width * c.c.height : c.width * c.height) || 0 : 0);
    const light = w.light ? sum([...Object.values(w.light.big || {}), ...Object.values(w.light.src || {})].map(px)) : 0;
    return { still: spread(still), pan: spread(pan), memoryMpx: { main: +(w.cv.width * w.cv.height / 1e6).toFixed(2), ground: +(((w.gc && w.gc.bytes) || px(w.gc)) / (w.gc && w.gc.bytes ? 4 : 1) / 1e6).toFixed(2), light: +(light / 1e6).toFixed(2), sprites: +(S.stats.pixels / 1e6).toFixed(2) }, sprites: { ...S.stats } };
  };
  R.shoot = async (s, o) => {
    const w = pc.world, T = s.t == null ? o.t : s.t; // a shot may be drawn at a clock time of its own (the drift pair)
    if (s.hour != null && !o.reduced) R.light(s.hour, T); else if (!o.reduced) R.light(o.hour, T);
    if (s.map) { w.setMode('map'); w.camTo = null; }
    if (s.fit) w.fit(false); else w.goTo(s.x, s.y, s.z, false);
    w.dirty = true; w.t = w.vt = w.env.t = T;
    R.draw(); await sleep(130);                                // the first draw tells the sprite cache the zoom has changed; it builds nothing until the zoom has rested
    let prev = '', same = 0, n = 1, h = '';
    while (n < o.maxDraws) { R.draw(); n++; h = R.canvasHash(w.cv); if (h === prev) same++; else same = 0; prev = h; if (same >= 2 && n >= o.draws) break; }
    const shot = { draws: n, stable: same >= 2, hash: h, t: T, cam: { x: w.cam.x, y: w.cam.y, z: w.cam.z }, canvas: { w: w.cv.width, h: w.cv.height, dpr: w.dpr, css: [w.W, w.H] }, night: +w.night.toFixed(3), dusk: +w.dusk.toFixed(3), png: w.cv.toDataURL('image/png') };
    if (s.map) { w.setMode('world'); w.camTo = null; }
    return shot;
  };
})()`;
const seedJS = (seed, wall) => `(() => { let a = ${seed >>> 0}; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; Date.now = () => ${wall}; })();`;

// ------------------------------------------------------------------------------------------------------------------------------ run
mkdirSync(O.out, { recursive: true });
rmSync(`${O.out}/manifest.partial.json`, { force: true });
const gitHead = (() => { try { const dir = fileURLToPath(new URL('..', import.meta.url)); return execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim() + (execSync('git status --porcelain js css index.html', { cwd: dir }).toString().trim() ? '+changes' : ''); } catch { return null; } })();
const app = await startApp({ base: O.base, w: O.w, h: O.h, cdp: O.cdp, dsf: O.dsf, reduced: O.motion === 'reduced' });
const { p } = app;
const done = () => { try { app.close(); } catch { /* already gone */ } };
process.on('SIGINT', () => { done(); process.exit(130); });
const manifest = { rig: 'world-shots v1', options: O, git: gitHead, startedAt: new Date().toISOString(), notes: [], shots: [] };
try {
  // a game through the real draft screen, with the random numbers and the wall clock fixed just before Begin
  for (let i = 0; i < 80 && !(await p.eval(`[...document.querySelectorAll('button')].some(b=>/Play solo/i.test(b.textContent))`)); i++) await p.sleep(250); // the title screen
  await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
    for (const id of ${JSON.stringify(O.perks.split(','))}) { const cb=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value===id||c.closest('label,article,div')?.textContent.toLowerCase().includes(id)); cb?.click(); await wait(100); }
    ${seedJS(O.seed, 1767225600000)}
    [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); })()`);
  for (let i = 0; i < 60 && !(await p.eval('!!(window.pc && pc.world && pc.world.unlocked)')); i++) await p.sleep(250);
  if (!(await p.eval('!!(window.pc && pc.world && pc.world.unlocked)'))) throw new Error('the world did not come up (is --base serving the app?)');
  await quiet(p);
  await p.eval(`(()=>{ const g = pc.S.game; g.s.pid = 'PC-RIG0'; g.s.handle = 'Rig'; pc.S.handle = 'Rig'; ${O.gameHour > 0 ? `g.advanceTo(${O.gameHour}); pc.S.emit('change');` : ''} })()`);
  if (O.gameHour > 0) await quiet(p);
  await p.eval(PAGE);
  const dpr = O.canvasDpr === 'app' ? 0 : Math.min(2, O.dsf);
  const o = { seed: O.seed ^ 0x5bd1e995, perfDraws: 40, debug: O.debug, dpr, hour: O.hour, t: O.t, reduced: O.motion === 'reduced', maxDraws: O.maxDraws, draws: O.draws };
  manifest.world = await p.eval(`__rig.freeze(${JSON.stringify(o)})`);
  manifest.state = { hash: await p.eval('__rig.stateHash()'), seed: await p.eval('pc.S.game.s.seed'), worldSeed: await p.eval('pc.S.worldSeed'), hour: await p.eval('pc.S.game.s.hour'), zones: await p.eval('pc.S.game.s.zones') };
  for (const s of order) {
    if (s.unlock) { manifest.notes.push(`${s.name} opened district ${s.unlock.join(', ')} in the game state before it was drawn; it is the last shot`); await p.eval(`__rig.unlock(${JSON.stringify(s.unlock)}, ${JSON.stringify(o)})`); }
    const cam = s.fit ? { fit: true } : { x: s.at[0], y: s.at[1], z: s.z };
    const r = await p.eval(`__rig.shoot(${JSON.stringify({ ...cam, hour: s.hour, map: s.map, t: s.dt == null ? undefined : O.t + s.dt })}, ${JSON.stringify(o)})`);
    const png = Buffer.from(r.png.slice(r.png.indexOf(',') + 1), 'base64'); delete r.png;
    writeFileSync(`${O.out}/${s.name}.png`, png);
    if (O.full) await p.shot(`${O.out}/${s.name}.full.png`);
    const row = { name: s.name, sets: s.sets, file: `${s.name}.png`, hour: s.hour ?? O.hour, requested: s.fit ? { fit: true } : { x: Math.round(s.at[0]), y: Math.round(s.at[1]), z: s.z }, ...r, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex').slice(0, 16) };
    if (s.panFrom) row.panFrom = s.panFrom;
    if (s.zoomFrom) row.zoomFrom = s.zoomFrom;
    if (s.map) row.map = true;
    manifest.shots.push(row);
    console.log(`${s.name.padEnd(26)} cam ${Math.round(r.cam.x)},${Math.round(r.cam.y)} z ${r.cam.z.toFixed(3)}  draws ${r.draws}${r.stable ? '' : ' UNSTABLE'}  ${r.canvas.w}x${r.canvas.h}  ${r.hash}`);
  }
  // a pair of shots taken to test the water's anchoring: record the camera's move in device pixels
  for (const s of manifest.shots) if (s.panFrom) { const a = manifest.shots.find((x) => x.name === s.panFrom); if (a) s.shiftDevicePx = [Math.round((s.cam.x - a.cam.x) * s.cam.z * s.canvas.dpr * 1e3) / 1e3, Math.round((s.cam.y - a.cam.y) * s.cam.z * s.canvas.dpr * 1e3) / 1e3]; }
  manifest.shots.sort((x, y) => (ALL.has(x.name) ? [...ALL].indexOf(x.name) : 0) - (ALL.has(y.name) ? [...ALL].indexOf(y.name) : 0));
  manifest.state.hashAfter = await p.eval('__rig.stateHash()');
  if (O.perf) { // frame cost at each shot's camera, still and panning; milliseconds of one draw() in this machine's headless Chrome (a software canvas: the figures compare builds, not machines)
    const perf = { rig: 'world-shots v1 --perf', git: gitHead, dsf: O.dsf, canvas: manifest.world.cvw + 'x' + manifest.world.cvh, shots: {} };
    for (const s of order) { const cam = s.fit ? { fit: true } : { x: s.at[0], y: s.at[1], z: s.z }; perf.shots[s.name] = { zoom: manifest.shots.find((x) => x.name === s.name)?.cam.z, ...(await p.eval(`__rig.perf(${JSON.stringify({ ...cam, hour: s.hour })}, ${JSON.stringify(o)})`)) }; console.log(`perf ${s.name.padEnd(22)} still ${perf.shots[s.name].still.median} ms  panning ${perf.shots[s.name].pan.median} ms (p95 ${perf.shots[s.name].pan.p95})`); }
    const WORKING = ['coast-west', 'start-mid', 'fog-near', 'bridge-or-ferry'], FINEST = ['start-close', 'coast-close'], zs = Object.values(perf.shots), working = WORKING.map((n) => perf.shots[n]).filter(Boolean), finest = FINEST.map((n) => perf.shots[n]).filter(Boolean), med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
    perf.summary = { workingZoomShots: working.length, workingStillMedianMs: med(working.map((x) => x.still.median)), workingPanMedianMs: med(working.map((x) => x.pan.median)), finestZoomShots: finest.length, finestWorstMs: finest.length ? Math.max(...finest.map((x) => x.pan.max)) : null, mostOffscreenMB: +(Math.max(...zs.map((x) => x.memoryMpx.ground + x.memoryMpx.light + x.memoryMpx.sprites)) * 4).toFixed(1), mostCanvasMB: +(Math.max(...zs.map((x) => x.memoryMpx.main + x.memoryMpx.ground + x.memoryMpx.light + x.memoryMpx.sprites)) * 4).toFixed(1) };
    perf.summary.note = 'working zoom = ' + WORKING.join(', ') + ' (median of the shots\' median frame); finest = ' + FINEST.join(', ') + ' (the worst frame); mostOffscreenMB = the largest ground cache + light layers + sprites of any one view at 4 bytes a pixel, mostCanvasMB the same with the visible canvas';
    writeFileSync(`${O.out}/perf.json`, JSON.stringify(perf, null, 1)); console.log('perf summary', JSON.stringify(perf.summary));
  }
  manifest.unstable = manifest.shots.filter((s) => !s.stable).map((s) => s.name);
  manifest.errors = p.logs.filter((l) => /error|EXC|warn/i.test(l)).slice(0, 20);
  manifest.finishedAt = new Date().toISOString();
  writeFileSync(`${O.out}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`\n${manifest.shots.length} shots in ${O.out}${manifest.unstable.length ? `\nUNSTABLE (did not settle in ${O.maxDraws} draws): ${manifest.unstable.join(', ')}` : ''}${manifest.errors.length ? `\nconsole: ${manifest.errors.join(' | ')}` : ''}`);
} catch (e) {
  console.error(e); try { writeFileSync(`${O.out}/manifest.partial.json`, JSON.stringify(manifest, null, 1)); } catch { /* nothing to keep */ }
  process.exitCode = 1;
} finally { done(); setTimeout(() => process.exit(process.exitCode || 0), 900); }
