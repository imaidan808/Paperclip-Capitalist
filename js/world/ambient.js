// The living air of the island, drawn in screen space over the finished world: cartoon rain, a trend surge's round confetti, floating pollen and fireflies, gulls over the water and butterflies over the meadows, the drifting
// smoke buildings ask for, and the V2 particles (round coins, soft double rings, little stars, dust). Presentation only; every motion is a function of the world's visual clock `w.vt` (0 under Calm, Off and reduced
// motion, when none of it is drawn: the picture stands still and clean), and nothing allocates in a frame (the pools and arrays are fx.js's, the paths are re-used).
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md sections 4.4, 5.7, 8). Registered as the V2 `weather`, `field` and `particles` layers by atmos.js.
import { h2, clamp, toGrid, HW } from './iso.js';
import { stampGlow } from './gfx.js';
import { LAYOUT, zAt } from './layout.js';
import { INK } from './palette.js';
import { COIN, SPARK, PUFF, RING } from './fx.js';

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
const ramp = (x, a, b) => smooth((x - a) / (b - a));

// ---------------------------------------------------------------- rain: fat rounded streaks in three depths, pastel, never a hairline (docs/ART_DIRECTION.md 9.2: at least 1.5 px)
export const RAIN = Object.freeze({ width: [1.6, 2.2, 3], len: [9, 15, 26], col: ['rgba(206,226,255,.34)', 'rgba(210,230,255,.5)', 'rgba(222,238,255,.68)'], slant: 0.36 });
/** The widest and thinnest line the rain draws, in screen px: the art direction's floor is 1.5. */
export const rainWidths = () => RAIN.width.slice();
export function paintRain(ctx, w) {
  const { W, H } = w, fx = w.fx; ctx.save(); ctx.lineCap = 'round';
  for (let layer = 0; layer < 3; layer++) {
    ctx.strokeStyle = RAIN.col[layer]; ctx.lineWidth = RAIN.width[layer]; ctx.beginPath(); const len = RAIN.len[layer];
    for (let i = layer; i < fx.drops; i += 3) { const x = fx.rx[i] * W, y = fx.ry[i] * H; ctx.moveTo(x, y); ctx.lineTo(x - len * RAIN.slant, y + len); }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- weather: a trend surge's round confetti and pink wash, a tariff's warm edge
export const CONFETTI = Object.freeze(['#ff7fb8', '#7be3ff', '#ffd84d', '#c9a6ff']);
export function paintWeather(ctx, w) {
  const { W, H } = w, e = w.env;
  if (e.crunch && w.rainOn) paintRain(ctx, w);
  if (e.surge && !w.reduced()) { const k = w.vt / 1000; ctx.globalAlpha = 0.7; for (let i = 0; i < 28; i++) { const x = (i * 97 + Math.sin(k + i) * 24) % W, y = ((k * 40 + i * 53) % (H + 20)) - 10; ctx.fillStyle = CONFETTI[i & 3]; ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3) * 0.7, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
  if (e.surge) { ctx.fillStyle = 'rgba(255,127,184,.05)'; ctx.fillRect(0, 0, W, H); }
  if (e.tariff) { ctx.fillStyle = 'rgba(255,96,80,.04)'; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- the field: pollen by day, fireflies by night, gulls, butterflies
const PAR = [0.3, 0.8, 1.4], RISE = [6, 10, 16], RAD = [4, 7, 14], ALPHA = [0.4, 0.34, 0.16];
/** How big a cell of sky is, world px: each holds at most one gull, which circles inside it. */
export const SKY_CELL = 2000;
/** Is there a gull in sky cell (cx, cy), and where is it at time t (ms)? Answers false for an empty cell; otherwise fills `out` { x, y (world px), dir (+1 flying right), flap (-1..1, two beats a second), size (wingspan, world px), lap (ms) }. A cell's gull is always the same bird on the same loop, a lap of 60 to 90 s. */
export function gullAt(cx, cy, t, out) {
  const k = cx * 911 + cy * 1721; if (h2(k, 71) > 0.62) return false;
  const lap = (60 + 30 * h2(k, 72)) * 1000, a = (t / lap) * TAU * (h2(k, 73) > 0.5 ? -1 : 1) + h2(k, 74) * TAU, rx = 500 + 400 * h2(k, 75), ry = rx * 0.45;
  out.x = (cx + 0.2 + 0.6 * h2(k, 76)) * SKY_CELL + Math.cos(a) * rx; out.y = (cy + 0.2 + 0.6 * h2(k, 77)) * SKY_CELL + Math.sin(a) * ry + Math.cos(a * 3 + k) * 30;
  out.dir = Math.sign(-Math.sin(a) * (h2(k, 73) > 0.5 ? -1 : 1)) || 1; out.flap = Math.sin(t / 500 * TAU + k * 1.7); out.size = 30 + 14 * h2(k, 78); out.lap = lap; return out;
}
const GULL = { x: 0, y: 0, dir: 1, flap: 0, size: 30, lap: 0 };
const WING = '#fffaf0', WINGSHADE = '#c6cdf0';
/** One gull: two rounded wings in a shallow V that rise and fall with its flap, a soft shadow on the water. (x, y) on screen, s the wingspan in px. */
function paintGull(ctx, x, y, s, flap, dir) {
  const lift = flap * s * 0.18, w = s / 2;
  ctx.globalAlpha *= 1; ctx.fillStyle = 'rgba(74,63,136,.12)'; ctx.beginPath(); ctx.ellipse(x + s * 0.3, y + s * 1.1, s * 0.5, s * 0.14, 0, 0, TAU); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const tx = x + side * w, ty = y - lift - s * 0.06, mx = x + side * w * 0.5, my = y - lift * 0.4 - s * 0.14;
    ctx.strokeStyle = WINGSHADE; ctx.lineWidth = Math.max(2.6, s * 0.15); ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(mx, my + 2, tx, ty + 2); ctx.stroke();
    ctx.strokeStyle = WING; ctx.lineWidth = Math.max(2, s * 0.115); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
  }
  ctx.fillStyle = WING; ctx.beginPath(); ctx.ellipse(x + dir * 1, y + 1, Math.max(2.4, s * 0.11), Math.max(1.8, s * 0.08), 0, 0, TAU); ctx.fill();
}
/** A meadow cell is this many tiles on a side; each has one butterfly, at a home that is a hashed place in it (grid tiles). */
export const BF_CELL = 9;
export const butterflyHome = (cx, cy, axis) => (axis ? cy + 0.15 + 0.7 * h2(cx * 733 + cy * 1291, 84) : cx + 0.15 + 0.7 * h2(cx * 733 + cy * 1291, 83)) * BF_CELL;
/** A butterfly's place on its figure of eight round a home in grid tiles (a flower patch on a meadow): world px of the place and its height above the ground. */
export function butterflyAt(gx0, gy0, k, t, out) {
  const u = t / 1000 * (0.25 + 0.15 * h2(k, 81)) + h2(k, 82) * TAU, ox = Math.sin(u) * 2.2, oy = Math.sin(u * 2) * 1.2, gx = gx0 + ox, gy = gy0 + oy;
  out.x = (gx - gy) * HW; out.y = (gx + gy) * 16 - zAt(gx0, gy0) - 26 - Math.sin(u * 3) * 6; out.flap = Math.sin(t / 450 * TAU + k * 2.3); out.dir = Math.cos(u) >= 0 ? 1 : -1; return out;
}
const BF = { x: 0, y: 0, flap: 0, dir: 1 }, BCOL = [['#ff9cc2', '#ffd1e3'], ['#ffd84d', '#fff0a8'], ['#9ad6ff', '#d6efff'], ['#c9a6ff', '#e6d6ff'], ['#ffb066', '#ffe0bd']];
function paintButterfly(ctx, x, y, s, flap, dir, k) {
  const wd = s * (0.3 + 0.7 * Math.abs(flap)), c = BCOL[k % BCOL.length];
  ctx.fillStyle = 'rgba(74,63,136,.1)'; ctx.beginPath(); ctx.ellipse(x + 2, y + s * 1.6, s * 0.6, s * 0.16, 0, 0, TAU); ctx.fill();
  for (const side of [-1, 1]) { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.ellipse(x + side * wd * 0.55, y - s * 0.28, wd * 0.5, s * 0.55, side * -0.4, 0, TAU); ctx.fill(); ctx.fillStyle = c[1]; ctx.beginPath(); ctx.ellipse(x + side * wd * 0.62, y - s * 0.38, wd * 0.22, s * 0.24, side * -0.4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = INK.contour; ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, s * 0.12), s * 0.42, 0, 0, TAU); ctx.fill();
}
export function paintField(ctx, w) {
  if (w.lite || w.reduced() || w.env.crunch || w.mode === 'map') return;
  const { W, H, cam, vt } = w, night = w.night, z = cam.z, lod = w.env.lod;
  ctx.save();
  if (z > 0.7) for (let i = 0; i < 36; i++) { // pollen by day (round, warm), fireflies by night: three depth layers that slide past one another with the camera
    const d = i % 3, par = PAR[d], u = h2(i, 41), v = h2(i, 42), ph = h2(i, 43), wrapW = W + 80, wrapH = H + 80;
    const x = mod(u * wrapW + Math.sin(vt / 3100 + ph * 6.28) * 14 * (d + 1) - cam.x * z * par, wrapW) - 40, y = mod(v * wrapH - vt * RISE[d] * 0.001 - cam.y * z * par * 0.8, wrapH) - 40, r = RAD[d] * (0.7 + ph * 0.6) * (0.8 + 0.2 * z);
    if (night < 0.98) { ctx.globalCompositeOperation = 'source-over'; stampGlow(ctx, '255,244,200', x, y, r, ALPHA[d] * (1 - night) * (0.6 + 0.4 * Math.sin(vt / 1900 + i))); }
    if (night > 0.05 && d < 2) { ctx.globalCompositeOperation = 'lighter'; const b = Math.max(0, Math.sin(vt / 760 + ph * 6.28)); stampGlow(ctx, '214,255,160', x, y, 2.4 + d * 1.8, 0.85 * night * b * b); }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const gul = (1 - ramp(z, 0.8, 1.3)) * (1 - night * 0.8); // gulls at the far and middle zooms: never at close range
  if (gul > 0.03) {
    ctx.globalAlpha = gul; const x0 = Math.floor((cam.x - W / 2 / z) / SKY_CELL) - 1, x1 = Math.floor((cam.x + W / 2 / z) / SKY_CELL) + 1, y0 = Math.floor((cam.y - H / 2 / z) / SKY_CELL) - 1, y1 = Math.floor((cam.y + H / 2 / z) / SKY_CELL) + 1;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      if (!gullAt(cx, cy, vt, GULL)) continue; const x = (GULL.x - cam.x) * z + W / 2, y = (GULL.y - cam.y) * z + H / 2, s = Math.max(9, GULL.size * z * 1.4); if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      paintGull(ctx, x, y, s, GULL.flap, GULL.dir);
    }
    ctx.globalAlpha = 1;
  }
  const bf = ramp(z, 0.95, 1.3) * (1 - night); // butterflies over the meadows once the camera is in close
  if (bf > 0.03 && lod) {
    ctx.globalAlpha = bf; const [ga, gb] = toGrid(cam.x - W / 2 / z, cam.y - H / 2 / z, 0), [gc, gd] = toGrid(cam.x + W / 2 / z, cam.y + H / 2 / z, 0), x0 = Math.floor(Math.min(ga, gc) / BF_CELL) - 1, x1 = Math.ceil(Math.max(ga, gc) / BF_CELL) + 1, y0 = Math.floor(Math.min(gb, gd) / BF_CELL) - 1, y1 = Math.ceil(Math.max(gb, gd) / BF_CELL) + 1;
    let n = 0;
    for (let cx = x0; cx <= x1 && n < 10; cx++) for (let cy = y0; cy <= y1 && n < 10; cy++) {
      const k = cx * 733 + cy * 1291, gx = butterflyHome(cx, cy, 0), gy = butterflyHome(cx, cy, 1); if (!LAYOUT.isLand(Math.floor(gx), Math.floor(gy))) continue;
      butterflyAt(gx, gy, k, vt, BF); const x = (BF.x - cam.x) * z + W / 2, y = (BF.y - cam.y) * z + H / 2; if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue; n++;
      paintButterfly(ctx, x, y, Math.max(5, 7 * z), BF.flap, BF.dir, Math.abs(k) | 0);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- smoke: what buildings ask for (the hook: push { wx, wy, size } to env.smoke from a live part) drawn as round pastel puffs that rise, drift down the wind and thin out
/** One column of smoke from (x, y) on screen: `n` puffs, each rising 38 px over 3.2 s, growing from 3 to 11, drifting with the wind and fading as they climb. `t` is the visual clock in ms (0: none). */
export function paintSmoke(ctx, x, y, t, size = 1, n = 4, wind = 1) {
  if (!t) return;
  for (let i = 0; i < n; i++) { const k = (t / 3200 + i / n) % 1, r = (3 + 8 * k) * size; ctx.globalAlpha = 0.5 * (1 - k) * (1 - k) * Math.min(1, k * 6); ctx.fillStyle = k < 0.35 ? '#f4efe6' : '#e6e6f2'; ctx.beginPath(); ctx.arc(x + wind * (k * 16 + Math.sin(k * 5 + i * 1.7) * 3), y - k * 38 * size, r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}
/** Draw and clear the queue buildings pushed this frame (env.smoke: [{ wx, wy, size }], world px). */
export function paintSmokeQueue(ctx, w) {
  const q = w.env.smoke; if (!q || !q.length) return;
  if (!w.reduced() && !w.far) { const { W, H, cam } = w, z = cam.z; for (let i = 0; i < q.length; i++) { const s = q[i], x = (s.wx - cam.x) * z + W / 2, y = (s.wy - cam.y) * z + H / 2; if (x < -40 || x > W + 40 || y < -80 || y > H + 40) continue; ctx.save(); ctx.translate(x, y); ctx.scale(z, z); paintSmoke(ctx, 0, 0, w.vt + i * 400, s.size || 1, 4, w.env.wind); ctx.restore(); } }
  q.length = 0;
}

// ---------------------------------------------------------------- the particles (fx.js's pool): round coins that turn, little stars, soft dust and double rings, text pops with a soft plum edge
const GOLD = '#ffd84d', GOLD_D = '#e0a42c', GOLD_L = '#fff3b0';
function star4(ctx, x, y, r) { const q = r * 0.34; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + q, y - q, x + r, y); ctx.quadraticCurveTo(x + q, y + q, x, y + r); ctx.quadraticCurveTo(x - q, y + q, x - r, y); ctx.quadraticCurveTo(x - q, y - q, x, y - r); ctx.closePath(); ctx.fill(); }
export function paintParticles(ctx, w) {
  const fx = w.fx; if (!fx.active) return;
  const { W, H, cam } = w, z = cam.z, ox = W / 2 - cam.x * z, oy = H / 2 - cam.y * z, night = w.night, calm = w.reduced(), N = fx.kind.length;
  if (fx.live) {
    for (let i = 0; i < N; i++) {
      const k = fx.kind[i]; if (k !== PUFF && k !== RING && k !== COIN) continue;
      const t = fx.age[i] / fx.life[i], x = fx.x[i] * z + ox, y = fx.y[i] * z + oy; if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      if (k === PUFF) { const r = fx.size[i] * (0.9 + t * 1.6) * z, a = (1 - t) * (1 - t) * 0.5; if (night < 0.98) stampGlow(ctx, '246,236,214', x, y, r, a * (1 - night)); if (night > 0.02) stampGlow(ctx, '160,170,210', x, y, r, a * night); ctx.globalAlpha = 1; }
      else if (k === RING) { // a soft double ring along the ground: a wide pale one under a thin bright one
        const r = (fx.vx[i] + (fx.vy[i] - fx.vx[i]) * (1 - (1 - t) * (1 - t))) * z, a = 1 - t; ctx.lineWidth = 6; ctx.strokeStyle = `rgba(255,226,140,${a * 0.28})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = `rgba(255,243,176,${a * 0.85})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, TAU); ctx.stroke();
      } else { // a coin: a turning gold disc with a lit crescent
        const a = clamp((1 - t) * 3, 0, 1), spin = Math.abs(Math.cos(fx.age[i] * 9 + fx.seed[i])), wd = Math.max(2, 5.5 * spin) * z, ht = 5.5 * z; ctx.globalAlpha = a;
        ctx.fillStyle = GOLD_D; ctx.beginPath(); ctx.ellipse(x, y, wd / 2 + 0.6 * z, ht / 2 + 0.6 * z, 0, 0, TAU); ctx.fill(); ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(x - 0.2 * z, y - 0.3 * z, wd / 2, ht / 2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = GOLD_L; ctx.beginPath(); ctx.ellipse(x - wd * 0.15, y - ht * 0.2, wd * 0.18, ht * 0.18, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      if (fx.kind[i] !== SPARK) continue;
      const t = fx.age[i] / fx.life[i], x = fx.x[i] * z + ox, y = fx.y[i] * z + oy; if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      const tw = 0.7 + 0.3 * Math.sin(fx.age[i] * 14 + fx.seed[i]), r = fx.size[i] * (1 - t * 0.5) * z * 1.5;
      stampGlow(ctx, '255,226,140', x, y, r * 1.8, (1 - t) * 0.6 * tw); ctx.globalAlpha = (1 - t) * tw; ctx.fillStyle = '#fff6d0'; star4(ctx, x, y, Math.max(2.4, r));
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  if (fx.liveTexts) {
    const s = clamp(z, 0.75, 1.25);
    ctx.font = `800 ${Math.round(15 * s)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(44,42,86,.88)';
    for (const p of fx.texts) {
      if (!p.on) continue;
      const x = Math.round(p.x * z + ox), y = Math.round((p.y - (calm ? 0 : p.age * 26)) * z + oy);
      ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1); ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1; ctx.lineJoin = 'miter';
  }
}
