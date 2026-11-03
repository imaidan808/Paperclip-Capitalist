// How a cloud bank is PAINTED, flat, in the author's second art direction (docs/ART_DIRECTION.md 3.5 and section 6): a lobe is a flat disc of its tier's pale tone (three tiers, the back one a little bluer and darker, the front one
// the palest), the bank is its lobes back to front over a cel-shaded underside (the shade is the same lobes painted lower and to the right in two darker flat steps, so the lower right of every edge, and of every window,
// keeps a rim of belly), and each BIG lobe is two flat discs, a darker step a little down and to the right under the tone a little up and to the left, so every billow has a flat rim of its own. There is no gradient, no
// glint, no outline and no stroke. The bank's shadow on the land and the sea is a handful of soft ellipses (the soft ambient shadow of the references). The lobes (where they stand, how big, where the windows are) are
// cloudform.js; the cache that bakes a bank once into chunks of device pixels and the layer that stamps them are cloudcache.js and clouds.js. Pure drawing: nothing here reads the game or keeps a bitmap of its own.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md section 6).
//
// The history, so nobody goes back to it. The first painter drew a puff as a flat disc, a flat crescent of belly and a flat crescent of light on every puff, which read as bubble wrap (judge round 1, F1); shading every lobe as a
// ball (a bright centre, a dark rim all round) read as a pit of balloons; the third painter filled each lobe with a radial gradient dome and added a soft glint and a thin contour, which read as glossy bubbles ("overtly 2D, not
// matte", the author, 2026-11-02). What stands now is flat tones by depth, one underside that follows the union's outline, and a rim only on the big lobes (variant D of the pictures the author chose from).
//
// Hours. The grade (grade.js) multiplies the finished picture by the hour's colour, periwinkle at night (0.55, 0.60, 0.87 of each channel), and lays a periwinkle air over it, so a white bank would come out brighter
// and bluer than anything else in the frame (judge F5: purple foam, self-lit plastic). The bank's night tones are chosen BEFORE that multiply, as the colour that the tint turns into what is wanted: sand-grey bodies
// (200, 195, 170) that come out as a quiet blue-grey (110, 116, 148), a belly two thirds darker, and a lit rim that can reach no further than the tint's own colour. It keeps its form by value, never by hue.
import { mix, clamp } from './iso.js';
import { CLOUD } from './palette.js';
import { formOf, lightCover, SHADOW, castsShadow } from './cloudform.js';
import { shadowLength, stampSoft } from './shadow.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the colours of the hour (memoised: a still sky builds nothing)
/** The tones of a tier at the day, golden and night ends: [lit, hi, body, mid, belly] and `flat`, the one flat pale tone of the tier's lobes (back to front: a pale periwinkle, a paler one, the palest, all cool white by day). */
const DAY = Object.freeze([
  Object.freeze({ lit: '#faf8f8', hi: '#f1f1fb', body: '#e6e9f8', mid: '#d0d6f1', belly: '#aab4e4', flat: '#e4e8f8' }),
  Object.freeze({ lit: '#fffaf0', hi: '#faf6f0', body: '#eeeffa', mid: '#d9ddf4', belly: '#aeb7e6', flat: '#eef1fb' }),
  Object.freeze({ lit: '#fffbf1', hi: '#fff8ee', body: '#f3f3fb', mid: '#dfe2f6', belly: '#b3bbe9', flat: '#f8f9fe' }),
]);
const GOLD = Object.freeze({ lit: '#ffe9c4', hi: '#ffdfbc', body: '#fbd7c8', mid: '#e4b6cf', belly: '#9d83cb', flat: '#ffe6d4' });
const NIGHT = Object.freeze([
  Object.freeze({ lit: '#ebe6d3', hi: '#d2cdb8', body: '#b0ab94', mid: '#85826f', belly: '#575557', flat: '#b0ab94' }),
  Object.freeze({ lit: '#f2eddb', hi: '#dcd7c2', body: '#bab49c', mid: '#8f8b77', belly: '#5d5b5c', flat: '#bab49c' }),
  Object.freeze({ lit: '#f8f3e1', hi: '#e4dfca', body: '#c6c0a5', mid: '#99957f', belly: '#636162', flat: '#c6c0a5' }),
]);
const KEYS = ['lit', 'hi', 'body', 'mid', 'belly', 'flat'];
const TONES = new Map(), SHADES = 6;
/**
 * The tones of a bank for the light now. `warm` is 0..1 (the golden hour: tops catch the low sun, bellies go rose), `cool` 0..1 (the night). A record per (warm, cool) in eighths. A record is
 * { tiers: [3 x { cols[SHADES + 1] }], shade } where cols[q] is the tier's colours for a lobe at q / SHADES of the way down the bank (the underside's steps, mid and belly, are cooler and deeper towards the foot,
 * so the union of the lobes is shaded as one form and not as a heap of the same ball) and `flat`, the tier's own flat tone, the same from the top of the bank to its foot.
 */
export function bankTones(warm = 0, cool = 0) {
  const w = Math.round(clamp(warm, 0, 1) * 8), c = Math.round(clamp(cool, 0, 1) * 8), key = w * 16 + c; let t = TONES.get(key);
  if (t) return t;
  const kw = w / 8, kc = c / 8, kn = kc * kc; // the night's own tones come in late: the blue hour (half the night in) is still mostly the golden evening's tones under the grade's rose-violet
  const tiers = DAY.map((day, row) => {
    const base = {}; for (const k of KEYS) base[k] = mix(mix(day[k], GOLD[k], kw * 0.8), NIGHT[row][k], kn);
    const cols = []; for (let q = 0; q <= SHADES; q++) { const ht = q / SHADES, e = {};
      e.lit = mix(base.lit, '#fffdf6', (1 - ht) * 0.5 * (1 - kc * 0.7)); e.hi = mix(base.hi, e.lit, (1 - ht) * 0.5); e.flat = base.flat;
      e.body = mix(base.body, base.mid, ht * 0.5); e.mid = mix(base.mid, base.belly, ht * 0.45); e.belly = mix(base.belly, mix(base.belly, '#7f8fd2', 0.4), ht * (1 - kc * 0.5));
      cols.push(Object.freeze(e)); }
    return Object.freeze({ cols: Object.freeze(cols) });
  });
  const shade = mix(mix(CLOUD.shadow, '#6a5a9c', kw * 0.4), '#3d3f72', kc * 0.6);
  t = Object.freeze({ tiers: Object.freeze(tiers), shade, key });
  if (TONES.size > 200) TONES.clear(); TONES.set(key, t); return t;
}

// ---------------------------------------------------------------- one lobe
/** How far the bright body of the bank stands up and to the left of its shade, as shares of the base radius: the bank is painted twice, once in its belly colour where it is and once in its tone lifted by this, so the lower right of every edge, and the lower right of every window, keeps a rim of belly. */
export const LIFT = Object.freeze({ x: 0.05, y: 0.14 });
/** The rim of a big lobe: lobes up to `k` (the class of the lobe: the big ones of the core are low) are two flat discs, the darker step `d` of the radius down and to the right under the tone a little up and to the left. */
export const RIM = Object.freeze({ k: 0.5, d: 0.07 });

/**
 * Paint lobes back to front. `o`: { a, e, f (the matrix of the surface being painted: device pixels per world pixel and the translation, so the painter sets each lobe's transform itself and leaves the matrix as it
 * found it), tones (bankTones), r0 (the bank's base radius), top, bot (the bank's vertical extent: a lobe's shade by its height in it), view (a world rectangle: lobes outside it are skipped), lite (accepted and
 * ignored: there is no fine detail left to leave out), fx (a function (lobe, out) that fills out { dx, dy, s, a } for the dissolve, else every lobe is whole) }. Answers how many lobes were painted.
 * Two passes. The shade: every lobe a flat disc of its belly colour where it stands, then of the mid colour half way up to the sun. The bodies: every lobe a flat disc of its tier's tone, lifted up and to the left by LIFT, so the
 * belly shows only where the edge faces away from the sun; a big lobe is a flat rim and a flat tone (RIM).
 */
export function paintLobes(ctx, lobes, o) {
  const { a, e, f, tones, view, fx } = o, top = o.top ?? 0, span = Math.max(1, (o.bot ?? 1) - top), r0 = o.r0 ?? 60, lx = LIFT.x * r0, ly = LIFT.y * r0, prev = ctx.globalAlpha, out = fx ? { dx: 0, dy: 0, s: 1, a: 1 } : null;
  let n = 0;
  const seen = (l, r) => !view || !(l.x + r + lx < view.x0 || l.x - r - lx > view.x1 || l.y + r + ly < view.y0 || l.y - r - ly > view.y1);
  const qOf = (l) => clamp(Math.round(((l.y - top) / span) * SHADES), 0, SHADES);
  // ---- the shade, in two steps so the underside is cel-shaded and not one hard band: every lobe a flat disc of the belly colour where it stands, then of the mid colour half way up to the sun
  ctx.setTransform(a, 0, 0, a, e, f);
  for (let step = 0; step < 2; step++) for (const l of lobes) {
    let x = l.x - (step ? lx * 0.5 : 0), y = l.y - (step ? ly * 0.5 : 0), r = l.r, al = 1;
    if (fx) { fx(l, out); if (out.a < 0.02) continue; x += out.dx; y += out.dy; r *= out.s; al = out.a; }
    if (!seen(l, r)) continue;
    const col = tones.tiers[l.row].cols[qOf(l)];
    ctx.globalAlpha = prev * al; ctx.fillStyle = step ? col.mid : col.belly; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // ---- the bodies: each lobe a flat disc of its tier's tone, lifted towards the sun; a big lobe a flat rim under it
  for (const l of lobes) {
    let x = l.x - lx, y = l.y - ly, r = l.r, al = 1;
    if (fx) { fx(l, out); if (out.a < 0.02) continue; x += out.dx; y += out.dy; r *= out.s; al = out.a; }
    if (!seen(l, r)) continue;
    const col = tones.tiers[l.row].cols[qOf(l)]; ctx.globalAlpha = prev * al;
    if (l.k <= RIM.k) { const d = r * RIM.d; ctx.fillStyle = col.mid; ctx.beginPath(); ctx.arc(x + d * 1.1, y + d * 0.9, r - d * 0.9, 0, TAU); ctx.fill(); x -= d * 1.1; y -= d * 0.9; r -= d * 0.9; }
    ctx.fillStyle = col.flat; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); n++;
  }
  ctx.globalAlpha = prev; ctx.setTransform(a, 0, 0, a, e, f);
  return n;
}

// ---------------------------------------------------------------- the shadow of a bank on the land and the sea
/**
 * The soft shadow a bank throws, in world space (the matrix is set by the caller): a pale broad ellipse under the whole bank and a soft one under each of the lobes along its foot, all pushed down and to the right by
 * the light (the sun stands upper left: the shadow falls towards +gx, as every cast shadow in the world). Stamps of the shared soft sprite (shadow.js), so there is no hard edge anywhere and nothing is built per frame.
 * `night` and `dusk` are the world's; `alpha` scales it all (the district's fog, 0 to 1). Answers how many stamps.
 */
export function paintCloudShadow(ctx, form, o) {
  const { tones, night = 0, dusk = 0, alpha = 1 } = o, S = SHADOW, len = shadowLength(night, dusk), sx = S.sx * len, sy = S.sy * len, colour = tones.shade, box = form.box, prev = ctx.globalAlpha; let n = 0;
  const view = o.view, seen = (x, y, rx, ry) => !view || !(x + rx < view.x0 || x - rx > view.x1 || y + ry < view.y0 || y - ry > view.y1), k = alpha * (1 - 0.45 * clamp(night, 0, 1));
  if (k < 0.004) return 0; // a faded bank has no shadow
  const w = box.x1 - box.x0, h = box.y1 - box.y0, cx = (box.x0 + box.x1) / 2 + sx, cy = box.y0 + h * S.broadAt + sy;
  if (seen(cx, cy, w * S.broadRx, h * S.broadRy)) { stampSoft(ctx, cx, cy, w * S.broadRx, h * S.broadRy, 0.36 * k, colour); n++; }
  for (const l of form.lobes) {
    if (!castsShadow(l)) continue;
    const x = l.x + sx, y = l.y + l.r * S.lobeDown + sy, rx = l.r * S.lobeRx, ry = l.r * S.lobeRy;
    if (seen(x, y, rx, ry)) { stampSoft(ctx, x, y, rx, ry, 0.3 * k, colour); n++; }
  }
  ctx.globalAlpha = prev; return n;
}

// ---------------------------------------------------------------- banks are made once per district and scale
const BANKS = new Map();
/** The painted bank over district `D` at a lattice scale (1 fine, 1.6 coarse, 2.6 far), made once and kept (cloudform.js formOf). */
export function bankOf(D, scale = 1) {
  const key = D.fp[0] * 100000 + D.fp[1] * 100 + scale * 3; let b = BANKS.get(key);
  if (!b) { b = formOf(D, scale); if (BANKS.size > 64) BANKS.clear(); BANKS.set(key, b); }
  return b;
}
export function releaseBanks() { BANKS.clear(); }
/** How much of a light of radius `r` at the world point (x, y) the fine bank of district `D` covers, 0..1 (cloudform.js lightCover). The light pools use it: a lamp under the cloud is hidden, a lamp in a window shines. */
export const coverUnder = (D, x, y, r = 40) => lightCover(bankOf(D, 1), x, y, r);

// ---------------------------------------------------------------- the dissolve of a bank that is opening
/** How far into its own lift a lobe is when `dis.ms` milliseconds of the dissolve have gone: 0 not begun, 1 gone. A lobe waits 0.35 s x (its distance from the gate / the bank's span), then takes 1.1 s. Pure. */
export const lobeLift = (dis, p) => { const d = Math.hypot(p.x - dis.gx, (p.y - dis.gy) * 2) / (dis.span || 1), q = (dis.ms - 350 * d * 2.4) / 1100; return q <= 0 ? 0 : q >= 1 ? 1 : q; };
/** The `fx` of paintLobes for a dissolve: a lobe rises 36 world px, drifts 14 outwards from the gate, shrinks to 0.6 and fades as it goes (docs/ART_DIRECTION.md 6.4). */
export function dissolveFx(dis) {
  return (l, out) => { const q = lobeLift(dis, l); out.a = (1 - q) * (1 - q); out.s = 1 - 0.4 * q; out.dx = q * 14 * Math.sign(l.x - dis.gx || 1); out.dy = -q * 36; };
}
/** The `fx` of paintLobes for a fade of the whole bank to `a` (reduced motion: a 400 ms cross-fade, no travel). */
export function fadeFx(a) { return (l, out) => { out.a = a; out.s = 1; out.dx = 0; out.dy = 0; }; }

export { TAU, SHADES };
