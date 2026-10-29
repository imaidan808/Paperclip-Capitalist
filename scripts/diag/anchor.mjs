// Is the sea anchored to the world? Shoot the same scene at two camera positions and measure how far a patch of open sea moved against how far a patch of land moved.
// A world-anchored sea moves exactly as the land does (the camera's own displacement, in device pixels); a sea painted in screen space does not move at all.
// node scripts/diag/anchor.mjs   (DIAG_BASE / DIAG_CDP as in lib.mjs)   Exit code 1 while the sea is not anchored.
import { boot, view, pixels } from './lib.mjs';
const DSF = 2, Z = 0.5, A = [710.66, 2587], B = [A[0] + 240, A[1] + 160];          // B: the camera 120 css px right and 80 css px down (at zoom 0.5)
const EXPECT = [-(B[0] - A[0]) * Z * DSF, -(B[1] - A[1]) * Z * DSF];                 // content slides left and up by exactly that many device pixels
const REGIONS = { sea: [[1000, 800, 1600, 1300], [800, 600, 1300, 1000]], land: [[1380, 500, 1880, 780]] };    // device px in A: open water of the big bay, and the quay wall with its tiles
const app = await boot({ dsf: DSF, gpu: true }); const { p } = app;
let failed = false;
try {
  const shots = {};
  for (const [k, c] of [['A', A], ['B', B]]) { await view(p, { z: Z, wx: c[0], wy: c[1] }); shots[k] = await pixels(p); }
  const { w: W, h: H } = shots.A;
  const hp = (px) => { const l = new Float32Array(W * H); for (let i = 0; i < W * H; i++) l[i] = 0.3 * px.data[i * 4] + 0.59 * px.data[i * 4 + 1] + 0.11 * px.data[i * 4 + 2];
    const out = new Float32Array(W * H), k = 4; for (let y = k; y < H - k; y++) for (let x = k; x < W - k; x++) { let s = 0; for (let b = -k; b <= k; b += 2) for (let a = -k; a <= k; a += 2) s += l[(y + b) * W + x + a]; out[y * W + x] = l[y * W + x] - s / 25; } return out; };
  const LA = hp(shots.A), LB = hp(shots.B);
  const corr = (r, dx, dy) => { const [x0, y0, x1, y1] = r; let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const a = LA[y * W + x], b = LB[(y + dy) * W + x + dx]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++; } const va = saa - sa * sa / n, vb = sbb - sb * sb / n; return va > 1e-6 && vb > 1e-6 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : 0; };
  const best = (r) => { let b = { c: -9, dx: 0, dy: 0 }; for (let dy = -300; dy <= 300; dy += 4) for (let dx = -300; dx <= 300; dx += 4) { const [x0, y0, x1, y1] = r; if (x0 + dx < 0 || y0 + dy < 0 || x1 + dx > W || y1 + dy > H) continue; const c = corr(r, dx, dy); if (c > b.c) b = { c, dx, dy }; }
    for (let dy = b.dy - 3; dy <= b.dy + 3; dy++) for (let dx = b.dx - 3; dx <= b.dx + 3; dx++) { const c = corr(r, dx, dy); if (c > b.c) b = { c, dx, dy }; } return b; };
  console.log(`camera moved by ${B[0] - A[0]},${B[1] - A[1]} world px at zoom ${Z}, density ${DSF}: land and anchored water must slide by ${EXPECT[0]},${EXPECT[1]} device px`);
  for (const [kind, rs] of Object.entries(REGIONS)) for (const r of rs) {
    const b = best(r), ok = Math.abs(b.dx - EXPECT[0]) <= 2 && Math.abs(b.dy - EXPECT[1]) <= 2; if (kind === 'sea' && !ok) failed = true;
    console.log(`${kind.padEnd(5)} region ${r.join(',')}: best correlation ${b.c.toFixed(2)} at shift ${b.dx},${b.dy}  ${ok ? 'ANCHORED' : 'NOT anchored'}`);
  }
} catch (e) { console.log('ERR', e.stack); failed = true; } finally { app.close(); }
process.exit(failed ? 1 : 0);
