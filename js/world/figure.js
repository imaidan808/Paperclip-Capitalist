// The people of the toy island as FLAT FIGURES, drawn live: a small head, thin long limbs, oversized clothes, smallish chunky shoes, a minimal face (two dots, or a short closed-eye line). Matte but vibrant flat fills with a light
// flat shading (a darker step of the same colour on the side away from the sun); no outline, no gradient, no highlight or rim streak, no texture: the silhouette carries the figure (docs/ART_DIRECTION.md 3.4, the second art direction
// of 2026-11-02, which replaced the round-headed dolls of 3.1).
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). Every part is a filled path: a limb is a capsule (limb), a garment a rounded polygon (rpoly), a ring is two arcs wound against each other; nothing here
// strokes, clips, blurs or reads a gradient, and the one translucent fill of a figure is its flat ground shadow. Pure drawing over the toys.js helpers: nothing reads the game, the clock or Math.random; a pose is a function
// of the record `K` that characters.js fills (poseOf), at the detail `A` = { mid, face, fine } of the ladder (far is a pill, drawn by the layer: mid is the body, hair and hat; near adds the face and what is held; close the mouth).
import { shade, rr, disc, poly, fade } from './toys.js';
import { INK, LIGHT, TOY } from './palette.js';

/** The numbers of a figure at scale 1, in world pixels, the soles on y = 0 and up negative (the head is a fifth of the height, a limb four or five times as long as it is wide). */
export const DIM = Object.freeze({ height: 35, headY: -31.2, headRx: 3.3, headRy: 3.7, hipY: -15.4, ankleY: -3.5, shoulderY: -25.4, shoulderX: 6, legX: 2.1, legR: 1.3, armR: 1.2, armLen: 11.4, shoeW: 6.5 });
/** The garments a person is drawn in (a long coat is the one a role makes), the legwear, the marks a garment may carry, and the hair: the lists a look is chosen from, so a crowd has a bounded number of silhouettes. */
export const BUILDS = ['jacket', 'puffer', 'poncho', 'hoodie', 'sweater', 'tee'];
export const LEGS = ['trousers', 'shorts', 'tights'];
export const MARKS = ['plain', 'stripes', 'print'];
export const STYLES = ['short', 'bun', 'long', 'curly', 'crop', 'bald', 'pony'];
const D = DIM, TAU = Math.PI * 2;
const dk = (c) => shade(c, 0.78), skd = (c) => shade(c, 0.86), CREAM = '#fffaf0', GOLD = '#ffd84d', COOL = '#c8d6ea';
/** The two darker tones a figure uses (of any colour, and of skin): the tests tell a part from its shade by them. */
export const TONE = Object.freeze({ dk, skd });
/** The light shading: a shape is drawn twice, the darker copy a little down and to the right and the lighter a little up and to the left (the sun is upper left), so that what shows of the darker is a flat rim on the lower right and none on the upper left: no outline, no gradient, no highlight. */
const SH = Object.freeze({ x: 0.8, y: 0.6 });

// ---------------------------------------------------------------- the parts every figure is made of (all fills)
/** A limb: a capsule from (x0, y0) to (x1, y1), radius r0 at the first end and r1 at the second, one filled path round at both ends. */
function limb(g, x0, y0, r0, x1, y1, r1, fill) {
  const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.arc(x0, y0, r0, a + Math.PI / 2, a + Math.PI * 1.5); g.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2); g.closePath(); g.fillStyle = fill; g.fill();
}
/** The corners of a polygon rounded to radius r, worked out once: for each point the corner itself, its two tangent points and the radius that fits (a tangent is never longer than half an edge, so a corner too sharp or an edge too short for r can not throw a spike, as arcTo does when it must reach past the end of an edge). */
function rounded(pts, r) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const half = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) / 2, t = Math.min(r / Math.tan(half), lu / 2, lv / 2);
    return [p[0], p[1], p[0] + (ux / lu) * t, p[1] + (uy / lu) * t, p[0] + (vx / lv) * t, p[1] + (vy / lv) * t, t * Math.tan(half)];
  });
}
/** A garment: its rounded corners (see rounded), moved by (dx, dy), as one filled shape. */
function rpoly(g, C, dx, dy, fill) {
  g.beginPath(); for (let i = 0; i < C.length; i++) { const c = C[i]; if (i) g.lineTo(c[2] + dx, c[3] + dy); else g.moveTo(c[2] + dx, c[3] + dy); g.arcTo(c[0] + dx, c[1] + dy, c[4] + dx, c[5] + dy, c[6]); }
  g.closePath(); g.fillStyle = fill; g.fill();
}
/** A ring of width w and outer radius r (two arcs wound against each other: glasses, a rope, a handle). */
function ring(g, x, y, r, w, fill) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.arc(x, y, r - w, 0, TAU, true); g.fillStyle = fill; g.fill(); }
/** A band of width w round (cx, cy) at radius r from angle a0 to a1 (a headband, an arch handle). */
function band(g, cx, cy, r, w, a0, a1, fill) { g.beginPath(); g.arc(cx, cy, r, a0, a1); g.arc(cx, cy, r - w, a1, a0, true); g.closePath(); g.fillStyle = fill; g.fill(); }
/** The top half of an ellipse, flat side down at y (a cap, a dome, a hood), lightly shaded. */
function dome(g, x, y, rx, ry, fill, flat) {
  const half = (cx, cy, a, b, c) => { g.beginPath(); g.ellipse(cx, cy, a, b, 0, Math.PI, 0); g.closePath(); g.fillStyle = c; g.fill(); };
  if (flat) half(x, y, rx, ry, fill); else { half(x + 0.45, y + 0.3, rx - 0.45, ry - 0.3, dk(fill)); half(x - 0.45, y - 0.3, rx - 0.45, ry - 0.3, fill); } // shaded like everything else, unless asked flat (a hood that is already the dark step, a closed eye)
}
const mirror = (half) => half.concat(half.slice().reverse().map(([x, y]) => [-x, y])); // the right side of a garment from the neck down to the hem, made whole

// ---------------------------------------------------------------- the garments: the right half from the neck to the hem, and the half-width of each at a height (for the marks that sit on it)
export const GARMENT = {
  jacket: { half: [[2.6, -28.4], [6.6, -27], [7, -20.4], [8, -12.8]], r: 2.4, sleeve: 0.72, sr: 2.7 },
  puffer: { half: [[3.4, -28.8], [7, -27], [8.1, -20], [7.8, -12.4]], r: 3.6, sleeve: 0.62, sr: 3 },
  poncho: { half: [[2.8, -28.4], [5.4, -27.2], [9.6, -14], [10.2, -11.8]], r: 2.4, sleeve: 0, sr: 0 },
  hoodie: { half: [[3, -28.2], [6.9, -27], [7.9, -19], [8.4, -12.6]], r: 2.4, sleeve: 0.74, sr: 2.6 },
  sweater: { half: [[2.8, -28.4], [6.4, -27], [6.8, -20], [7, -13.2]], r: 2.2, sleeve: 0.8, sr: 2.4 },
  tee: { half: [[2.6, -28], [5.9, -26.9], [6.5, -21], [6.9, -16.6]], r: 2.2, sleeve: 0, sr: 0 },
  coat: { half: [[3, -28.4], [6.6, -27], [7.4, -17], [8.2, -6.4]], r: 2.4, sleeve: 0.72, sr: 2.5 },
};
for (const g of Object.values(GARMENT)) g.corners = rounded(mirror(g.half), g.r);
/** Half the width of a garment at height y (a line between the corners of its right side): the stripes and prints stay inside it. */
function halfAt(b, y) { const h = GARMENT[b].half; for (let i = 1; i < h.length; i++) if (y <= h[i][1]) { const k = (y - h[i - 1][1]) / (h[i][1] - h[i - 1][1]); return h[i - 1][0] + (h[i][0] - h[i - 1][0]) * Math.max(0, k); } return h[h.length - 1][0]; }
/** The outfits of a role that are a garment of their own: the build a person wears when the role says so. */
export const ROLE_BUILD = Object.freeze({ coat: 'coat', hoodie: 'hoodie' });

function garment(g, K, b, dy, accent) {
  const G = GARMENT[b], c = K.shirt;
  if (b === 'hoodie') dome(g, 0, -26.6 + dy * 0.9, 5.4, 4, dk(c), true); // the hood, behind the head
  rpoly(g, G.corners, SH.x, dy + SH.y, b === 'coat' ? COOL : dk(c)); rpoly(g, G.corners, -SH.x, dy - SH.y, b === 'coat' ? CREAM : c); // the shade on the lower right, the lit garment over it
  const edge = (y) => Math.max(1, halfAt(b, y) - 0.45);
  if (b === 'puffer') { for (const y of [-22.4, -17.4]) rr(g, -edge(y), y + dy, edge(y) * 2, 1, 0.5, dk(c)); rr(g, -3.4, -29.6 + dy, 6.8, 2.6, 1.3, dk(c)); } // the quilting seams and the high collar
  else if (b === 'jacket') { rr(g, -0.5, -27.4 + dy, 1, 14.4, 0.5, dk(c)); poly(g, [[-3.2, -28.2 + dy], [-0.7, -26.4 + dy], [-0.7, -28.8 + dy]], accent); poly(g, [[3.2, -28.2 + dy], [0.7, -26.4 + dy], [0.7, -28.8 + dy]], accent); rr(g, -edge(-14), -14.6 + dy, edge(-14) * 2, 1.6, 0.8, accent); } // the zip, the collar and a ribbed hem
  else if (b === 'hoodie') { rr(g, -3.7, -18.2 + dy, 7.4, 3.6, 1.4, dk(c)); rr(g, -2.1, -27.4 + dy, 0.9, 4.6, 0.45, CREAM); rr(g, 1.2, -27.4 + dy, 0.9, 4.6, 0.45, CREAM); } // the pocket and the strings
  else if (b === 'poncho') rr(g, -edge(-13.4), -14.2 + dy, edge(-13.4) * 2, 1.7, 0.85, accent); // a trim round the hem
  else if (b === 'sweater') rr(g, -3.3, -28.7 + dy, 6.6, 1.8, 0.9, accent); // the neck band
  else if (b === 'coat') { rr(g, -0.5, -27.4 + dy, 1, 20.4, 0.5, '#c8d6ea'); disc(g, 3.3, -21.8 + dy, 2, 2, CREAM); rr(g, 2.7, -23 + dy, 1.2, 2.8, 0.4, '#ff5f4e'); rr(g, 1.9, -22.2 + dy, 2.8, 1.2, 0.4, '#ff5f4e'); }
  if (K.mark === 'stripes' && b !== 'puffer') for (const y of b === 'tee' ? [-23.4, -20.4] : b === 'poncho' ? [-18.6, -16.4] : [-23.4, -20.2, -17]) rr(g, -edge(y), y + dy, edge(y) * 2, 1.5, 0.5, accent);
  else if (K.mark === 'print' && b !== 'puffer' && b !== 'coat') { poly(g, [[0.7, -25.2 + dy], [-2.2, -20.4 + dy], [-0.2, -20.4 + dy], [-1.1, -16.6 + dy], [2.4, -21.8 + dy], [0.4, -21.8 + dy], [1.8, -25.2 + dy]], accent); }
}

// ---------------------------------------------------------------- the hair, the face, what is worn on the head
const COVERS = new Set(['hardhat', 'cap', 'boldcap', 'tophat', 'beret', 'bowler', 'beanie', 'helmet', 'sailor', 'straw']); // hats that sit over the top of the head: no hair shows above them
function hairBack(g, style, c, hy) { // behind the head: a bun, long locks, a curly mass, a tail
  if (style === 'bun') disc(g, 0, hy - 4.4, 1.9, 1.9, c);
  else if (style === 'long') rr(g, -4.3, hy - 2.4, 8.6, 10.4, 3.2, dk(c));
  else if (style === 'curly') for (const [x, y, r] of [[-3.5, -0.6, 1.9], [3.5, -0.6, 1.9], [-3, -3.2, 2], [3, -3.2, 2], [0, -4.2, 2.1]]) disc(g, x, hy + y, r, r, c);
  else if (style === 'pony') limb(g, -2.6, hy - 1.4, 1.4, -5.2, hy + 7, 0.8, dk(c));
}
function hairFront(g, style, c, hy, d) { // the cap of hair over the top of the head, a flat shape
  if (style === 'bald') return;
  dome(g, 0, hy - 0.4, 3.6, style === 'crop' ? 3.5 : 4.1, c);
  if (style === 'short' || style === 'bun' || style === 'long' || style === 'pony') disc(g, d * 1.5, hy - 2.6, 2.1, 1.3, c);
}
function face(g, K, A, hy) { // the dots, a short line when blinking, a closed happy arc, and at the close band a mouth
  const gz = K.gaze, ey = hy + 0.5 + K.look, ink = INK.darkest;
  if (A.face > 0.02) {
    const was = fade(g, A.face);
    for (const sx of [-1, 1]) { const x = sx * 1.7 + gz * 0.9; if (K.blink) rr(g, x - 1, ey - 0.2, 2, 0.7, 0.35, ink); else if (K.mood === 'smile') dome(g, x, ey + 0.5, 1.05, 0.95, ink, true); else disc(g, x, ey, 0.8, 0.95, ink); }
    g.globalAlpha = was;
  }
  if (A.fine > 0.02) {
    const was = fade(g, A.fine), x = gz * 0.8, y = hy + 2.3;
    if (K.mood === 'smile') { g.beginPath(); g.ellipse(x, y - 0.5, 1.2, 0.9, 0, 0, Math.PI); g.closePath(); g.fillStyle = ink; g.fill(); } else if (K.mood === 'o') disc(g, x, y, 0.65, 0.75, ink); else if (K.mood === 'flat') rr(g, x - 0.9, y - 0.3, 1.8, 0.6, 0.3, ink);
    g.globalAlpha = was;
  }
}
function glasses(g, kind, gz, hy) {
  const ink = INK.darkest, y = hy + 0.5;
  if (kind === 'glasses') { for (const sx of [-1, 1]) ring(g, sx * 2.1 + gz * 0.9, y, 2.1, 0.7, '#7a4df0'); rr(g, -0.5 + gz * 0.9, y - 0.5, 1, 0.7, 0.3, '#7a4df0'); }
  else if (kind === 'shades') { for (const sx of [-1, 1]) rr(g, sx * 2.1 + gz * 0.9 - 1.9, y - 1.2, 3.8, 2.4, 1.1, ink); rr(g, -0.6 + gz * 0.9, y - 0.8, 1.2, 0.8, 0.4, ink); }
  else if (kind === 'monocle') { ring(g, 2.1 + gz * 0.9, y, 2.2, 0.7, GOLD); rr(g, 4.1 + gz * 0.9, y + 1.8, 0.7, 4.4, 0.35, GOLD); }
}
function hat(g, kind, K, hy) {
  const d = K.dir, hb = hy - 1.2, hc = K.hatCol;
  if (kind === 'hardhat') { const c = '#ffd84d'; dome(g, 0, hb, 4.6, 4.7, c); rr(g, -5.6, hb - 1, 11.2, 1.5, 0.75, dk(c)); rr(g, -0.7, hb - 5.4, 1.4, 4.3, 0.7, dk(c)); }
  else if (kind === 'cap' || kind === 'boldcap') { const c = kind === 'cap' ? hc : K.boldCol; dome(g, 0, hb, 4.2, 4.2, c); disc(g, d * 4.2, hb - 0.2, 3.1, 0.9, dk(c)); }
  else if (kind === 'tophat') { const c = '#3b2f7a'; rr(g, -3.4, hb - 9, 6.8, 8, 1.2, c); rr(g, -3.5, hb - 4, 7, 1.6, 0.6, '#ff5fa8'); disc(g, 0, hb - 0.8, 5.6, 1.2, c); }
  else if (kind === 'beret') { const c = hc; disc(g, d * 0.9, hb - 2.2, 5.4, 2.4, c); rr(g, d * 0.9 - 0.6, hb - 5.4, 1.2, 1.8, 0.6, dk(c)); }
  else if (kind === 'bowler') { const c = '#7a4df0'; dome(g, 0, hb, 3.9, 4.2, c); disc(g, 0, hb, 5.4, 1.1, dk(c)); rr(g, -3.9, hb - 1.6, 7.8, 1.2, 0.6, INK.darkest); }
  else if (kind === 'beanie') { const c = hc; dome(g, 0, hb, 3.9, 4.3, c); rr(g, -4.1, hb - 2.2, 8.2, 2.1, 1, dk(c)); disc(g, 0, hb - 4.9, 1.6, 1.6, CREAM); }
  else if (kind === 'helmet') { const c = CREAM; dome(g, 0, hb, 4.3, 4.3, c); rr(g, -0.8, hb - 4.9, 1.6, 4, 0.8, TOY.cyan); rr(g, -4.3, hb - 1.3, 8.6, 1.2, 0.6, dk(c)); }
  else if (kind === 'visor') { const c = hc; rr(g, -4.3, hb - 2.6, 8.6, 1.8, 0.9, c); disc(g, d * 4, hb - 1.2, 3.3, 0.9, dk(c)); }
  else if (kind === 'straw') { const c = '#f6d77a'; disc(g, 0, hb - 0.8, 7.4, 1.6, dk(c)); dome(g, 0, hb - 0.8, 3.5, 3.3, c); rr(g, -3.5, hb - 2.6, 7, 1.4, 0.7, '#ff4d5e'); }
  else if (kind === 'sailor') { const c = CREAM; disc(g, 0, hb - 0.8, 4.9, 1.5, dk(c)); dome(g, 0, hb - 0.8, 4.3, 2.4, c); rr(g, -4.4, hb - 2.4, 8.8, 1.3, 0.65, '#2f5fe8'); }
  else if (kind === 'phones') { const c = '#ff5fa8'; band(g, 0, hy - 0.6, 4.5, 1.3, Math.PI * 1.04, Math.PI * 1.96, c); for (const sx of [-1, 1]) rr(g, sx * 4.2 - 1.2, hy - 1.2, 2.4, 3.6, 1.2, sx > 0 ? dk(c) : c); }
  else if (kind === 'headset') { const c = '#2a3b8f'; band(g, 0, hy - 0.6, 4.5, 1.2, Math.PI * 1.06, Math.PI * 1.94, c); for (const sx of [-1, 1]) rr(g, sx * 4.2 - 1.1, hy - 1, 2.2, 3, 1.1, c); limb(g, d * 4.2, hy + 1.6, 0.5, d * 2.2, hy + 3.4, 0.5, c); disc(g, d * 2, hy + 3.5, 0.9, 0.9, TOY.red); }
}

// ---------------------------------------------------------------- what is worn on the body, and what is held
function torsoExtra(g, kind, K, dy) {
  if (kind === 'tie') { poly(g, [[-2.2, -28.2 + dy], [2.2, -28.2 + dy], [0, -25.6 + dy]], CREAM); poly(g, [[-0.9, -26.2 + dy], [0.9, -26.2 + dy], [1.7, -18.6 + dy], [0, -16.6 + dy], [-1.7, -18.6 + dy]], '#ff4d5e'); }
  else if (kind === 'scarf') { rr(g, -5, -29.4 + dy, 10, 3.4, 1.7, CREAM); rr(g, K.dir * 2.4 - 1.7, -27.6 + dy, 3.4, 6.6, 1.7, CREAM); rr(g, K.dir * 2.4 - 1.7, -22.6 + dy, 3.4, 1.4, 0.7, '#ff5fa8'); }
  else if (kind === 'apron') { rr(g, -4.6, -22.2 + dy, 9.2, 8.8, 2.2, CREAM); rr(g, -2.2, -18.8 + dy, 4.4, 2.4, 0.9, GOLD); rr(g, -0.8, -28 + dy, 1.6, 5.8, 0.8, CREAM); }
  else if (kind === 'overalls') { const c = '#2f5fe8'; rr(g, -4, -22.8 + dy, 8, 7.4, 2.2, c); rr(g, -5.2, -28 + dy, 1.8, 6, 0.9, c); rr(g, 3.4, -28 + dy, 1.8, 6, 0.9, dk(c)); disc(g, -4.2, -22 + dy, 0.9, 0.9, GOLD); disc(g, 4.2, -22 + dy, 0.9, 0.9, GOLD); }
  else if (kind === 'lanyard') { poly(g, [[-3.2, -28.2 + dy], [-2, -28.2 + dy], [0.3, -19.4 + dy], [-0.3, -19.4 + dy]], TOY.cyan); poly(g, [[3.2, -28.2 + dy], [2, -28.2 + dy], [-0.3, -19.4 + dy], [0.3, -19.4 + dy]], TOY.cyan); rr(g, -2.2, -19.8 + dy, 4.4, 3.8, 0.9, CREAM); rr(g, -1.4, -19 + dy, 2.8, 1, 0.5, TOY.violet); }
}
function item(g, kind, K, hx, hy) {
  const d = K.dir;
  if (kind === 'briefcase') { rr(g, hx - 3.8, hy - 0.2, 7.6, 5.8, 1.2, '#b0653a'); rr(g, hx - 1.2, hy - 1.6, 2.4, 1.6, 0.7, '#7a4a2a'); rr(g, hx - 0.9, hy + 1.6, 1.8, 1.3, 0.4, GOLD); }
  else if (kind === 'basket') { disc(g, hx, hy + 3, 5.2, 3.4, '#b0653a'); disc(g, hx - 1.5, hy + 0.7, 2, 2, TOY.red); disc(g, hx + 1.8, hy + 0.5, 1.9, 1.9, TOY.green); band(g, hx, hy + 1.4, 4.4, 1, Math.PI, 0, '#7a4a2a'); }
  else if (kind === 'bag') { const c = K.bagCol; rr(g, hx - 3.4, hy + 0.8, 6.8, 7.2, 1.4, c); band(g, hx, hy + 1, 2.3, 0.9, Math.PI, 0, dk(c)); disc(g, hx, hy + 4.6, 1.1, 1.1, CREAM); }
  else if (kind === 'wrench') { limb(g, hx, hy + 1, 0.8, hx + d * 2.2, hy + 8.4, 0.8, '#8a96b8'); disc(g, hx + d * 2.4, hy + 9.4, 2.5, 2.3, '#8a96b8'); disc(g, hx + d * 2.4, hy + 9.8, 1, 0.9, '#4a5a7a'); }
  else if (kind === 'books') { rr(g, hx - 3.6, hy + 2, 7.6, 2.4, 0.8, '#ff4d5e'); rr(g, hx - 3.2, hy + 4.4, 7.2, 2.4, 0.8, '#2aa2f0'); rr(g, hx - 3.8, hy + 6.8, 7.8, 2.4, 0.8, GOLD); }
  else if (kind === 'satchel') { rr(g, hx - 4.6, hy + 1.4, 9.2, 6.6, 1.8, '#b0653a'); rr(g, hx - 4.6, hy + 1.4, 9.2, 3, 1.5, '#7a4a2a'); disc(g, hx, hy + 4.6, 1.1, 1.1, GOLD); }
  else if (kind === 'tablet') { rr(g, hx - 3.2, hy, 6.4, 8.4, 1.4, '#2a3b8f'); rr(g, hx - 2.4, hy + 0.8, 4.8, 6.4, 0.9, '#8ae8ff'); }
  else if (kind === 'clipboard') { rr(g, hx - 3.4, hy, 6.8, 9, 1, '#b0653a'); rr(g, hx - 2.6, hy + 1.6, 5.2, 6.8, 0.6, CREAM); rr(g, hx - 1.4, hy - 0.8, 2.8, 1.8, 0.7, GOLD); rr(g, hx - 1.6, hy + 3.4, 3.2, 0.9, 0.4, '#7a4df0'); }
  else if (kind === 'parcel') { rr(g, hx - 4, hy + 0.5, 8, 7, 1.2, '#d9a066'); rr(g, hx - 0.8, hy + 0.5, 1.6, 7, 0.4, '#ff4d5e'); }
  else if (kind === 'laptop') { rr(g, hx - 4.6, hy + 2, 9.2, 5.2, 1.2, '#8a96b8'); rr(g, hx - 3.8, hy + 2.6, 7.6, 3.4, 0.7, '#2a3b8f'); }
  else if (kind === 'rope') { ring(g, hx, hy + 4, 4.3, 1.6, '#e8c070'); ring(g, hx, hy + 4, 2.2, 1.1, '#d9a066'); }
  else if (kind === 'badge') { rr(g, hx - 2.6, hy + 1, 5.2, 4, 0.9, CREAM); rr(g, hx - 1.8, hy + 1.8, 3.6, 1, 0.5, TOY.blue); }
  else if (kind === 'whistle') { disc(g, hx, hy + 2, 2, 1.5, '#dfe6f4'); rr(g, hx - 2.4, hy + 1.5, 4, 1.4, 0.7, '#8a96b8'); }
}
function backpack(g, c, dy) { rr(g, -7.2, -26 + dy, 14.4, 12.4, 4.4, c); rr(g, -4.4, -19 + dy, 8.8, 4.6, 1.6, dk(c)); }

// ---------------------------------------------------------------- the figure
/**
 * One person, the soles at (x, y), scale `s` (1 is 35 world pixels from the soles to the crown; the player is drawn at 1.2), in the pose `K` = { dir, gaze, look, mood, step, bob, blink, wave, shirt, pants, skin,
 * hair, accent, shoe, sole, style, build, legs, mark, role, hatCol, boldCol, bagCol } at the detail `A` = { mid, face, fine }. The squash and the hop are applied by the caller as the transform it passes.
 */
export function drawFigure(g, x, y, s, K, A) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const R = K.role || {}, d = K.dir, st = K.step, by = -K.bob, skin = K.skin, pants = K.pants, accent = K.accent, b = ROLE_BUILD[R.torso] || K.build, G = GARMENT[b], covered = COVERS.has(R.head);
  { const was = fade(g, 0.28); disc(g, 1.6, 0.6, 9.6, 3.2, LIGHT.shadow); g.globalAlpha = was; } // a flat ground shadow, thrown away from the sun
  if (R.item === 'backpack') backpack(g, '#ff7a1a', by);
  const hy = D.headY + by * 0.8;
  hairBack(g, covered && K.style === 'bun' ? 'short' : K.style, K.hair, hy);
  // the arms: the thin arm is skin, the sleeve a wide tube over its upper part (or none), the hand tiny
  const armTo = (sx, ang) => { const sxp = sx * D.shoulderX, syp = D.shoulderY + by; return [sxp, syp, sxp + sx * 0.4 + Math.sin(ang) * D.armLen, syp + Math.cos(ang) * D.armLen]; };
  const arm = (a, front) => {
    const [x0, y0, x1, y1] = a, c = front ? K.shirt : dk(K.shirt), sk = front ? skin : skd(skin);
    limb(g, x0, y0, D.armR, x1, y1, D.armR - 0.1, sk);
    if (G.sleeve > 0) {
      const k = G.sleeve, cx = x0 + (x1 - x0) * k, cy = y0 + (y1 - y0) * k;
      if (front) { limb(g, x0 + 0.5, y0 + 0.4, G.sr, cx + 0.5, cy + 0.4, G.sr - 0.3, dk(c)); limb(g, x0 - 0.5, y0 - 0.4, G.sr, cx - 0.5, cy - 0.4, G.sr - 0.3, c); } else limb(g, x0, y0, G.sr, cx, cy, G.sr - 0.3, c); // the near sleeve is shaded, the far one is the dark step already
      disc(g, cx, cy + 0.4, G.sr - 0.2, 1.3, b === 'puffer' ? dk(c) : accent);
    }
    disc(g, x1, y1 + 0.5, 1.55, 1.55, sk);
  };
  const stepAng = (sign) => (st ? Math.sin(st) * 0.42 * sign * d : 0.1 * sign);
  arm(armTo(-d, stepAng(1)), false);
  // the legs and the chunky shoes (the step swings them; a foot lifts as it passes)
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const sw = st ? Math.sin(st + i * Math.PI) : 0, lift = st ? Math.max(0, Math.cos(st + i * Math.PI)) * 2 : 0, hx = sx * D.legX, fx = sx * 2.5 + sw * 2.6 * d * 0.8, fy = D.ankleY - lift, back = i === 1;
    const sh = K.legs === 'shorts' ? (back ? skd(skin) : skin) : (back ? dk(pants) : pants);
    limb(g, hx, D.hipY, D.legR, fx, fy, D.legR - 0.1, sh);
    if (K.legs === 'shorts') rr(g, hx - 2.7, D.hipY - 1.2, 5.4, 6.2, 1.8, back ? dk(pants) : pants); // baggy shorts: a short wide tube over the thin bare leg
    else if (K.legs === 'tights') for (const k of [0.45, 0.65]) rr(g, hx + (fx - hx) * k - 1.6, D.hipY + (fy - D.hipY) * k - 0.6, 3.2, 1.2, 0.6, accent);
    const bx = fx - D.shoeW / 2 + d, by0 = fy - 0.1; rr(g, bx, by0, D.shoeW, 2.6, 1.3, K.shoe); rr(g, bx, by0 + 1.9, D.shoeW, 1.7, 0.85, K.sole);
  }
  // the garment, and what a role wears over it
  garment(g, K, b, by, accent); if (R.torso && A.mid > 0.02 && !ROLE_BUILD[R.torso]) torsoExtra(g, R.torso, K, by);
  // the front arm (it waves when told to), and what the hand holds
  let hand;
  if (K.wave) { const sxp = d * D.shoulderX, syp = D.shoulderY + by, a = [sxp, syp, sxp + d * (4.4 + Math.sin(K.wave * 1.2) * 2.2), syp - 9.8]; arm(a, true); hand = null; } else { const a = armTo(d, stepAng(-1)); arm(a, true); hand = [a[2], a[3]]; }
  if (hand && R.item && A.face > 0.02 && R.item !== 'backpack') { const was = fade(g, A.face); item(g, R.item, K, hand[0], hand[1]); g.globalAlpha = was; }
  // the head: a small ellipse, the cap of hair, two dots, what is worn on it
  { const ns = R.torso === 'scarf' || b === 'coat' ? COOL : dk(K.shirt); disc(g, 0.4, hy + 3.3, 3, 1.1, ns); } // the shadow of the head on the collar
  disc(g, 0.4, hy + 0.35, D.headRx - 0.4, D.headRy - 0.35, skd(skin)); disc(g, -0.4, hy - 0.35, D.headRx - 0.4, D.headRy - 0.35, skin); // a small head, its shade a thin rim on the lower right
  if (A.mid > 0.02 && !covered) hairFront(g, K.style, K.hair, hy, d);
  face(g, K, A, hy);
  if (R.face && A.face > 0.02) { const was = fade(g, A.face); glasses(g, R.face, K.gaze, hy); g.globalAlpha = was; }
  if (R.head && A.mid > 0.02) hat(g, R.head, K, hy);
  g.restore();
}
