// The people of the toy island: round-headed dolls with two dot eyes, cheeks, hair and a hat or a thing in their hands by role, drawn live as capsules and discs (about forty flat fills a doll), and the
// V2 drawers of the buyers (`lead` layer) and the player (`player` layer).
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.1 (a doll is 34 world pixels, the player 42; head 0.40 of the height, a torso capsule, stub legs, round feet; eyes are dots
// 0.07 of the height; cheeks #ff9aa8 at 0.35), 4.4 (the player: tomato jacket, cream scarf, denim, a beanie with a paperclip pin; buyers: the palette of 2.6 and an accessory by role, the seventeen named originals
// override the rule; an urgent buyer waves and stands in a golden pulse, never a flat ellipse), 7.5 and 8.1 (idle bob 2.8 s, blink every 3 to 6 s for 80 ms, a hop when a buyer notices the player, squash and stretch,
// a step cycle of 0.45 s; every motion stands still under Calm, Off and reduced motion, with open eyes and a neutral mouth).
//
// What is drawn by band (env.lod): far is a pill in the shirt colour; mid is the body, hair and hat; near adds the face, the cheeks and what is held; close adds eyebrows, mouth states and the blink. All of it is a function of
// the world's own clock (env.t, which is 0 when motion is reduced) and of where the buyer and the player stand, so a still picture is the same on every draw.
import { registerLayer } from './stack.js';
import { BUYERS } from '../config.js';
import { zAt } from './layout.js';
import { leadAlpha, bubbleAlpha } from './common.js';
import { P, strHash, h2, clamp } from './iso.js';
import { PEOPLE, TOY, INK, GRASS, BLOOM, WOOD, METAL, personLook } from './palette.js';
import { mix, shade, hi, shd, disc, rr, bar, poly, stand, stampSoft, FONT, fade } from './toys.js';

// ---------------------------------------------------------------- what a buyer wears
const FAMILIES = [
  [['tool', 'vehicle', 'industrial', 'scrap'], { head: 'hardhat', item: 'wrench' }],
  [['office', 'paper', 'training'], { face: 'glasses', item: 'satchel' }],
  [['prestige', 'luxury', 'gem', 'collectible'], { head: 'tophat', torso: 'scarf' }],
  [['retro', 'home'], { head: 'beret', torso: 'scarf' }],
  [['media'], { head: 'phones', torso: 'scarf' }],
  [['electronics', 'digital', 'ip', 'infra'], { head: 'headset', item: 'tablet' }],
  [['trend', 'fashion', 'consumer'], { head: 'boldcap', face: 'shades', item: 'bag' }],
  [['finance', 'b2b', 'franchise', 'realty'], { torso: 'tie', item: 'briefcase' }],
  [['medical'], { torso: 'coat' }],
  [['food', 'farm', 'bulk', 'outdoor'], { head: 'straw', torso: 'apron', item: 'basket' }],
  [['marine', 'energy'], { head: 'sailor', item: 'rope' }],
];
/** The seventeen named originals override the rule of the families (docs/ART_DIRECTION.md 4.4). */
export const NAMED = {
  student: { head: 'beanie', item: 'backpack' }, barista: { head: 'cap', torso: 'apron' }, mechanic: { head: 'cap', torso: 'overalls', item: 'wrench' }, collector: { head: 'bowler', face: 'monocle' }, scrapper: { head: 'hardhat' },
  cyclist: { head: 'helmet' }, bookstore: { face: 'glasses', item: 'books' }, trainer: { torso: 'lanyard', item: 'whistle' }, boutique: { torso: 'scarf', item: 'bag' }, smelog: { item: 'clipboard' }, etailer: { item: 'parcel' },
  recruiter: { torso: 'tie', item: 'badge' }, freelancer: { head: 'phones', item: 'laptop' }, entIT: { torso: 'lanyard' }, holdco: { torso: 'tie', item: 'briefcase' }, vcstart: { torso: 'hoodie' }, franchisor: { head: 'visor' },
};
/** What a buyer wears: the named original's outfit, else the family of the strongest tag the buyer likes. `likes` is { tag: weight }. Pure. */
export function roleOf(seg, likes) {
  if (Object.hasOwn(NAMED, seg)) return NAMED[seg];
  const tags = Object.entries(likes || {}).sort((a, b) => b[1] - a[1]);
  for (const [t] of tags) for (const [list, r] of FAMILIES) if (list.includes(t)) return r;
  return {};
}
const COVERS = new Set(['hardhat', 'cap', 'boldcap', 'tophat', 'beret', 'bowler', 'beanie', 'helmet', 'sailor', 'straw']); // hats that sit over the top of the head: no hair shows above them, only a tuft at each ear
const HAIRSTYLES = ['short', 'bun', 'long', 'curly', 'crop', 'bald'];
/** One buyer's look, made once and kept on the entity: the palette's shirt, hair, skin and pants from the buyer's own hash, a hair style, and the outfit of the role. */
export function lookV2(e) {
  const l = e.lead, h = strHash(String((l && l.id) ?? e.id) + String(e.seg)), B = BUYERS[e.seg], base = personLook(h);
  return { ...base, style: HAIRSTYLES[(h >>> 16) % HAIRSTYLES.length], role: roleOf(e.seg, B && B.like), ph: (h % 1000) / 1000, blinkEvery: 3000 + (h % 3000), seg: e.seg };
}

// ---------------------------------------------------------------- the clock of a doll
/** A hop: 0 to 1 over 0.35 s from `t0`; answers the height in world pixels (6 at the top) and the stretch (Y 1.08, X 0.94 at the top). */
export function hopOf(t, t0) { const k = (t - t0) / 350; if (!(t0 >= 0) || k < 0 || k > 1) return { h: 0, sy: 1, sx: 1 }; const s = Math.sin(Math.PI * k); return { h: 6 * s, sy: 1 + 0.08 * s, sx: 1 - 0.06 * s }; }
/** The squash of a stop: 0.18 s, Y 0.92 first, a 4% overshoot, then 1; the X scale is the inverse. */
export function squashOf(t, t0) { const k = (t - t0) / 180; if (!(t0 >= 0) || k < 0 || k > 1) return { sy: 1, sx: 1 }; const sy = k < 0.45 ? 1 - 0.08 * Math.sin((k / 0.45) * Math.PI / 2) : 0.92 + 0.12 * Math.sin(((k - 0.45) / 0.55) * Math.PI) * 0.7 + 0.08 * ((k - 0.45) / 0.55); return { sy, sx: 2 - sy }; }
/** Are the eyes shut at time `t` (80 ms every 3 to 6 s)? Open for ever when time stands still. */
export const blinkOf = (t, every, ph) => t > 0 && (t + ph * every) % every < 80;
/** How far a buyer notices the player: within 3.5 tiles, a number 1 at the player's side and 0 at the edge. */
export const noticeOf = (dx, dy) => { const d = Math.hypot(dx, dy); return d < 3.5 ? 1 - d / 3.5 : 0; };

// ---------------------------------------------------------------- the doll
const dark = (c) => mix(shade(c, 0.5), '#2c2a56', 0.5);
function hat(g, kind, K, a) {
  const hx = 0, hy = -27.4, hc = K.hatCol;
  if (kind === 'hardhat') { const c = '#ffd84d'; disc(g, hx, hy - 4, 9.2, 2.6, shd(c)); g.beginPath(); g.ellipse(hx, hy - 4.2, 8.3, 7.4, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.5, hy - 4.6, 7.6, 6.5, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 1.2, hy - 11.2, 2.4, 7, 1.2, hi(c, 0.5)); disc(g, hx + 5.6, hy - 4.4, 2.4, 1.1, hi(c, 0.5)); }
  else if (kind === 'cap' || kind === 'boldcap') { const c = kind === 'cap' ? hc : K.boldCol; g.beginPath(); g.ellipse(hx, hy - 4, 8.4, 7.2, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.5, hy - 4.5, 7.6, 6.4, 0, Math.PI, 0); g.fillStyle = c; g.fill(); disc(g, hx + K.dir * 6.8, hy - 3.2, 4.4, 1.5, shd(c)); disc(g, hx + K.dir * 6.6, hy - 3.7, 4.2, 1.3, hi(c, 0.15)); }
  else if (kind === 'tophat') { const c = '#4a3f78'; disc(g, hx, hy - 4.4, 9.6, 2.7, shd(c)); disc(g, hx, hy - 5, 9.2, 2.3, c); rr(g, hx - 5.2, hy - 15, 10.4, 11, 2, shd(c)); rr(g, hx - 5.2, hy - 15, 8.6, 11, 2, c); rr(g, hx - 5.4, hy - 8.8, 10.8, 2.7, 1, '#ff7fb8'); disc(g, hx, hy - 15, 5.2, 1.6, hi(c, 0.35)); }
  else if (kind === 'beret') { const c = hc; disc(g, hx + 1.4, hy - 6, 9.6, 3.6, shd(c)); disc(g, hx + 0.9, hy - 6.6, 8.8, 3.1, c); disc(g, hx - 1, hy - 7.6, 3.6, 1.1, hi(c, 0.5)); bar(g, hx + 1.4, hy - 10, hx + 1.4, hy - 9.5, 3, shd(c)); }
  else if (kind === 'bowler') { const c = '#6a4a8c'; disc(g, hx, hy - 3.8, 9, 2.1, shd(c)); g.beginPath(); g.ellipse(hx, hy - 4, 6.6, 6.2, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.4, hy - 4.4, 5.9, 5.5, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 6.3, hy - 5.6, 12.6, 2, 1, '#2c2a56'); }
  else if (kind === 'beanie') { const c = hc; g.beginPath(); g.ellipse(hx, hy - 3.6, 8.2, 8, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.5, hy - 4, 7.5, 7.2, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 8.3, hy - 4.6, 16.6, 3.6, 1.8, hi(c, 0.35)); ball(g, hx, hy - 11.6, 2.4, '#fff7dc'); }
  else if (kind === 'helmet') { const c = '#fffaf0'; g.beginPath(); g.ellipse(hx, hy - 3.8, 8.7, 7.8, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.5, hy - 4.2, 8, 7, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 1.6, hy - 11.4, 3.2, 7.4, 1.6, TOY.cyan); rr(g, hx - 6.8, hy - 5, 13.6, 1.8, 0.9, shd(c)); }
  else if (kind === 'visor') { const c = hc; rr(g, hx - 8.2, hy - 5.6, 16.4, 3.4, 1.7, shd(c)); rr(g, hx - 8.2, hy - 5.8, 16, 2.6, 1.3, c); disc(g, hx + K.dir * 6.4, hy - 3.2, 5.6, 1.5, shd(c)); disc(g, hx + K.dir * 6.2, hy - 3.6, 5.4, 1.3, hi(c, 0.2)); }
  else if (kind === 'straw') { const c = '#f6d77a'; disc(g, hx, hy - 3, 12.6, 3.5, shd(c)); disc(g, hx, hy - 3.6, 12.2, 3.1, c); g.beginPath(); g.ellipse(hx, hy - 4.6, 6.4, 5.6, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.4, hy - 4.9, 5.8, 5, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 6, hy - 6.6, 12, 2.1, 1, '#e8503a'); }
  else if (kind === 'sailor') { const c = '#fffaf0'; disc(g, hx, hy - 3.6, 8.6, 2.4, shd(c)); g.beginPath(); g.ellipse(hx, hy - 4.2, 8.2, 5.2, 0, Math.PI, 0); g.fillStyle = shd(c); g.fill(); g.beginPath(); g.ellipse(hx - 0.4, hy - 4.5, 7.5, 4.6, 0, Math.PI, 0); g.fillStyle = c; g.fill(); rr(g, hx - 8.4, hy - 5.2, 16.8, 2.4, 1.2, '#3a5fb0'); }
  else if (kind === 'phones') { const c = '#ff7fb8'; g.beginPath(); g.ellipse(hx, hy - 3.8, 8.9, 8.8, 0, Math.PI * 1.04, Math.PI * 1.96); g.strokeStyle = shd(c); g.lineWidth = 2; g.stroke(); disc(g, hx - 8.6, hy + 1, 2.6, 3.6, c); disc(g, hx + 8.6, hy + 1, 2.6, 3.6, shd(c)); disc(g, hx - 8.9, hy + 0.4, 1, 1.5, hi(c, 0.6)); }
  else if (kind === 'headset') { const c = '#3a4a8a'; g.beginPath(); g.ellipse(hx, hy - 3.8, 8.9, 8.6, 0, Math.PI * 1.06, Math.PI * 1.94); g.strokeStyle = c; g.lineWidth = 1.8; g.stroke(); disc(g, hx - 8.7, hy + 1, 2.2, 3, c); disc(g, hx + 8.7, hy + 1, 2.2, 3, shd(c)); bar(g, hx + 8.6 * K.dir, hy + 3.6, hx + 5 * K.dir, hy + 7.4, 3, c); disc(g, hx + 5 * K.dir, hy + 7.6, 1.6, 1.6, TOY.red); }
}
function hairBack(g, style, c, K) { // hair behind the head: a bun, long locks, a curly mass
  if (style === 'bun') ball(g, 0, -37, 3.6, c);
  else if (style === 'long') { rr(g, -8.6, -29.6, 17.2, 13, 5.5, shd(c)); rr(g, -8.6, -29.6, 16, 12, 5.5, c); }
  else if (style === 'curly') for (const [x, y, r] of [[-7.4, -29, 3.6], [7.4, -29, 3.6], [-6.2, -34, 3.8], [6.2, -34, 3.8], [0, -35.6, 4]]) ball(g, x, y, r, c);
}
function hairFront(g, style, c) { // the cap of hair over the top of the head
  if (style === 'bald') return;
  g.beginPath(); g.ellipse(0, -28.2, 8.1, 7.2, 0, Math.PI * 1.02, Math.PI * 1.98); g.fillStyle = shd(c); g.fill();
  g.beginPath(); g.ellipse(-0.5, -28.6, 7.4, 6.5, 0, Math.PI * 1.02, Math.PI * 1.98); g.fillStyle = c; g.fill();
  if (style === 'short' || style === 'bun' || style === 'long') { disc(g, 3.2, -30.2, 4.6, 2.2, c); disc(g, -2.4, -29.5, 4.2, 2.1, c); }
  if (style === 'crop') rr(g, -7.6, -30.4, 15.2, 2.6, 1.3, c);
  { const alpha0 = fade(g, 0.45); disc(g, -3, -33.4, 2.6, 1.1, hi(c, 0.85)); g.globalAlpha = alpha0; }
}
function face(g, K, A) { // eyes, cheeks, mouth, brows: the near band adds the first two, the close band the rest
  const gz = K.gaze, ex = 2.7, ey = -26.3 + K.look, blink = K.blink;
  if (A.face > 0.02) {
    const prev = g.globalAlpha; g.globalAlpha = prev * A.face;
    { const alpha0 = fade(g, 0.4); disc(g, -ex * 1.6 + gz, -23.6, 1.9, 1.2, '#ff9aa8'); disc(g, ex * 1.6 + gz, -23.6, 1.9, 1.2, '#ff9aa8'); g.globalAlpha = alpha0; }
    for (const sx of [-1, 1]) { const x = sx * ex + gz * 0.9; if (blink) { rr(g, x - 1.5, ey - 0.4, 3, 1.1, 0.55, INK.darkest); } else { disc(g, x, ey, 1.45, 1.6, INK.darkest); disc(g, x - 0.45, ey - 0.55, 0.5, 0.5, '#ffffff'); } }
    if (K.mood === 'o') disc(g, gz * 0.8, -22.4, 1.1, 1.3, '#7a3040'); else if (K.mood === 'flat') rr(g, gz * 0.8 - 1.5, -22.7, 3, 1.1, 0.55, INK.darkest);
    else { g.beginPath(); g.arc(gz * 0.8, -23.4, K.mood === 'smile' ? 2.1 : 1.5, 0.15 * Math.PI, 0.85 * Math.PI); g.strokeStyle = '#7a3040'; g.lineWidth = 1.5; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt'; }
    g.globalAlpha = prev;
  }
  if (A.fine > 0.02) { // close: eyebrows that tilt with the mood
    const prev = g.globalAlpha; g.globalAlpha = prev * A.fine; const tilt = K.mood === 'flat' ? 0.5 : K.mood === 'o' ? -0.25 : 0;
    for (const sx of [-1, 1]) { g.save(); g.translate(sx * ex + gz * 0.9, ey - 3); g.rotate(sx * tilt); rr(g, -1.7, -0.6, 3.4, 1.2, 0.6, shade(K.hair, 0.8)); g.restore(); }
    g.globalAlpha = prev;
  }
}
function glasses(g, kind, gz) {
  if (kind === 'glasses') { g.strokeStyle = '#5a4a8c'; g.lineWidth = 1.5; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 2.8 + gz * 0.9, -26.2, 2.7, 0, 6.3); g.stroke(); } g.beginPath(); g.moveTo(-0.2 + gz * 0.9, -26.4); g.lineTo(0.2 + gz * 0.9, -26.4); g.stroke(); }
  else if (kind === 'shades') { for (const sx of [-1, 1]) { rr(g, sx * 2.8 + gz * 0.9 - 2.6, -27.6, 5.2, 3.4, 1.6, '#2c2a56'); } rr(g, -1 + gz * 0.9, -27, 2, 1.2, 0.6, '#2c2a56'); { const alpha0 = fade(g, 0.6); rr(g, -4.6 + gz * 0.9, -27.3, 2.4, 0.9, 0.45, '#8fe0e8'); g.globalAlpha = alpha0; } }
  else if (kind === 'monocle') { g.strokeStyle = '#d9a52c'; g.lineWidth = 1.5; g.beginPath(); g.arc(2.8 + gz * 0.9, -26.2, 2.8, 0, 6.3); g.stroke(); g.beginPath(); g.moveTo(5.4 + gz * 0.9, -24.6); g.lineTo(6.6, -19); g.stroke(); }
}
function torsoExtra(g, kind, K) {
  if (kind === 'tie') { poly(g, [[-1.8, -20.4], [1.8, -20.4], [0.8, -19], [-0.8, -19]], '#fffaf0'); poly(g, [[-1, -19.2], [1, -19.2], [1.9, -12.4], [0, -10.6], [-1.9, -12.4]], '#ff5f4e'); }
  else if (kind === 'scarf') { rr(g, -6.4, -21.6, 12.8, 4.2, 2.1, '#fffaf0'); rr(g, -6.4, -21.6, 11.2, 3.2, 1.6, '#fff7dc'); rr(g, K.dir * 3 - 1.8, -19.6, 3.6, 7, 1.8, '#fffaf0'); rr(g, K.dir * 3 - 1.8, -14.4, 3.6, 1.4, 0.7, '#ff7fb8'); }
  else if (kind === 'apron') { rr(g, -5.4, -16.4, 10.8, 9, 2.6, '#fff7dc'); rr(g, -5.4, -16.4, 9.4, 7.6, 2.6, '#fffaf0'); rr(g, -2.6, -14, 5.2, 3.4, 1.2, '#ffd84d'); rr(g, -5.6, -20, 1.6, 4.6, 0.8, '#fff7dc'); rr(g, 4, -20, 1.6, 4.6, 0.8, '#e8e0cc'); }
  else if (kind === 'coat') { rr(g, -6.2, -20.6, 12.4, 13.4, 5.4, '#e8f0fa'); rr(g, -6.2, -20.6, 10.8, 12.2, 5.4, '#fbfdff'); rr(g, -0.5, -20, 1, 12, 0.5, '#c8d6ea'); disc(g, 3.2, -16.4, 2.3, 2.3, '#fff'); rr(g, 2.5, -17.8, 1.4, 3.2, 0.5, '#ff5f4e'); rr(g, 1.6, -17, 3.2, 1.4, 0.5, '#ff5f4e'); }
  else if (kind === 'overalls') { const c = '#4a7ad0'; rr(g, -4.4, -17, 8.8, 8, 2.6, shd(c)); rr(g, -4.4, -17, 7.6, 7, 2.6, c); rr(g, -5.2, -20.2, 2, 5, 1, c); rr(g, 3.2, -20.2, 2, 5, 1, shd(c)); disc(g, -4.2, -15.6, 1, 1, '#ffd84d'); disc(g, 4.2, -15.6, 1, 1, '#ffd84d'); }
  else if (kind === 'lanyard') { g.strokeStyle = '#3ad4e6'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -20.6); g.lineTo(0, -14); g.lineTo(3, -20.6); g.stroke(); rr(g, -2.4, -14.4, 4.8, 3.6, 0.9, '#fffaf0'); rr(g, -1.6, -13.6, 3.2, 1, 0.5, TOY.violet); }
  else if (kind === 'hoodie') { ball(g, 0, -20.4, 3.6, K.shirt); rr(g, -4.2, -13, 8.4, 4, 1.6, shade(K.shirt, 0.86)); }
}
function item(g, kind, K, handX, handY) {
  const d = K.dir;
  if (kind === 'briefcase') { rr(g, handX - 4.2, handY - 0.5, 8.4, 6.2, 1.6, '#8a5a38'); rr(g, handX - 4.2, handY - 0.5, 8.4, 4.4, 1.6, '#b07a4c'); rr(g, handX - 1.1, handY - 2, 2.2, 2.2, 0.8, '#d9a52c'); rr(g, handX - 0.8, handY + 2, 1.6, 1.2, 0.5, '#f6c94f'); }
  else if (kind === 'basket') { disc(g, handX, handY + 3, 5.4, 3.4, '#9c6238'); disc(g, handX, handY + 2.4, 5, 3, '#cc8f50'); ball(g, handX - 1.5, handY + 0.4, 2.1, TOY.red); ball(g, handX + 1.8, handY + 0.2, 1.9, TOY.green); g.beginPath(); g.ellipse(handX, handY + 0.4, 4.6, 5, 0, Math.PI, 0); g.strokeStyle = '#9c6238'; g.lineWidth = 1.5; g.stroke(); }
  else if (kind === 'bag') { const c = K.bagCol; rr(g, handX - 3.4, handY + 0.5, 6.8, 7.2, 1.4, shd(c)); rr(g, handX - 3.4, handY + 0.5, 6, 6.2, 1.4, c); g.strokeStyle = shd(c); g.lineWidth = 1.5; g.beginPath(); g.arc(handX, handY + 0.6, 2.2, Math.PI, 0); g.stroke(); disc(g, handX - 0.4, handY + 4.6, 1.2, 1.2, '#fffaf0'); }
  else if (kind === 'wrench') { bar(g, handX, handY + 1, handX + d * 2.4, handY + 9, 3, '#b2bed8'); disc(g, handX + d * 2.4, handY + 9.6, 2.6, 2.4, '#8392b4'); disc(g, handX + d * 2.4, handY + 10, 1.1, 1, '#4a5a7a'); }
  else if (kind === 'books') { rr(g, handX - 3.6, handY + 2, 7.6, 2.4, 0.8, '#ff6a55'); rr(g, handX - 3.2, handY + 4.2, 7.2, 2.4, 0.8, '#4aa0f0'); rr(g, handX - 3.8, handY + 6.4, 7.8, 2.4, 0.8, '#ffd84d'); }
  else if (kind === 'satchel') { rr(g, handX - 4.6, handY + 1.4, 9.2, 6.6, 1.8, '#8a5a38'); rr(g, handX - 4.6, handY + 1.4, 9.2, 3.6, 1.8, '#b07a4c'); disc(g, handX, handY + 4.6, 1.1, 1.1, '#f6c94f'); }
  else if (kind === 'tablet') { rr(g, handX - 3.2, handY, 6.4, 8.4, 1.4, '#3a4a6a'); rr(g, handX - 2.4, handY + 0.8, 4.8, 6.4, 0.9, '#8ae8ff'); rr(g, handX - 1.6, handY + 1.8, 2.4, 1, 0.5, '#fff'); }
  else if (kind === 'clipboard') { rr(g, handX - 3.4, handY, 6.8, 9, 1, '#a8693f'); rr(g, handX - 2.6, handY + 1.6, 5.2, 6.8, 0.6, '#fffaf0'); rr(g, handX - 1.4, handY - 0.8, 2.8, 1.8, 0.7, '#d9a52c'); rr(g, handX - 1.6, handY + 3.4, 3.2, 0.9, 0.4, '#9a6bff'); }
  else if (kind === 'parcel') { rr(g, handX - 4, handY + 0.5, 8, 7, 1.2, '#c79b6a'); rr(g, handX - 4, handY + 0.5, 8, 4.4, 1.2, '#e0b98a'); rr(g, handX - 0.8, handY + 0.5, 1.6, 7, 0.4, '#ff5f4e'); }
  else if (kind === 'laptop') { rr(g, handX - 4.6, handY + 2, 9.2, 5.2, 1.2, '#b2bed8'); rr(g, handX - 3.8, handY + 2.6, 7.6, 3.4, 0.7, '#3a4a6a'); disc(g, handX, handY + 4.3, 1, 1, '#fff'); }
  else if (kind === 'rope') { g.beginPath(); g.ellipse(handX, handY + 4, 4.2, 3.4, 0, 0, 6.3); g.strokeStyle = '#e8c070'; g.lineWidth = 2.2; g.stroke(); g.beginPath(); g.ellipse(handX, handY + 4, 2, 1.5, 0, 0, 6.3); g.strokeStyle = '#c79b6a'; g.lineWidth = 1.5; g.stroke(); }
  else if (kind === 'badge') { rr(g, handX - 2.6, handY + 1, 5.2, 4, 0.9, '#fffaf0'); rr(g, handX - 1.8, handY + 1.8, 3.6, 1, 0.5, TOY.blue); }
  else if (kind === 'whistle') { disc(g, handX, handY + 2, 2, 1.5, '#dfe6f4'); rr(g, handX - 2.4, handY + 1.5, 4, 1.4, 0.7, '#b2bed8'); }
}
function backpack(g, K) { const c = '#ff9a3a'; rr(g, -7.6, -19.6, 15.2, 11.6, 4.6, shd(c)); rr(g, -7.6, -19.6, 14, 10.4, 4.6, c); rr(g, -4.6, -14, 9.2, 4.4, 1.6, hi(c, 0.35)); }

const SKIN_SH = (c) => mix(shade(c, 0.86), '#e0907a', 0.18);
/**
 * One doll, feet at (x, y), scale `s` (1 is 34 world pixels), in the pose `K` = { dir, gaze, look, mood, step, bob, blink, wave, arm, shirt, pants, skin, hair, style, role, hatCol, boldCol, bagCol }, at the detail `A` = { mid, face, fine }.
 * The squash and the hop are applied by the caller as the transform it passes.
 */
export function drawDoll(g, x, y, s, K, A) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const R = K.role || {}, st = K.step, bob = K.bob, pants = K.pants, shirt = K.shirt, skin = K.skin;
  stampSoft(g, 5, 1.1, 12.5, 4.6, 0.24); stand(g, 0.4, 0.5, 8.8, 3.8); // a soft shadow thrown away from the sun and a dark contact patch: a doll stands on the ground
  if (R.item === 'backpack') backpack(g, K);
  const covered = COVERS.has(R.head);
  hairBack(g, covered && K.style === 'bun' ? 'short' : K.style, K.hair, K);
  // legs and shoes (the step swings them; a stub lifts its foot as it passes)
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const sw = st ? Math.sin(st + i * Math.PI) : 0, lift = st ? Math.max(0, Math.cos(st + i * Math.PI)) * 1.8 : 0, lx = sx * 3 + sw * 2.6 * K.dir * 0.8;
    rr(g, lx - 2.7, -8.6 - lift * 0.4, 5.4, 8.2 - lift, 2.6, i ? shd(pants) : pants); { const alpha0 = fade(g, 0.35); rr(g, lx - 1.9, -8.2 - lift * 0.4, 1.5, 6.2 - lift, 0.75, hi(pants, 0.8)); g.globalAlpha = alpha0; } // a round leg with a lit strip
    disc(g, lx + K.dir * 0.5, -1.7 - lift, 4.3, 2.5, i ? '#3a2f5e' : '#4a3f78'); disc(g, lx + K.dir * 0.7 - 0.9, -2.6 - lift, 1.8, 0.9, '#7a6aa8'); disc(g, lx + K.dir * 0.5, -0.5 - lift, 4.0, 1.0, '#fffaf0'); // a shoe with a pale sole
  }
  const by = -bob; // the body rides the bob
  // back arm
  const armA = K.arm, aw = (a) => 4.4 + 0 * a;
  const arm = (sx, ang, front) => { const sxp = sx * 6.4, sy = -19.4 + by, L = 8.4, ex = sxp + sx * 0.8 + Math.sin(ang) * L, ey = sy + Math.cos(ang) * L; bar(g, sxp, sy, ex, ey, aw(0), front ? shirt : shade(shirt, 0.84)); disc(g, sxp, sy + 0.4, 2.9, 2.9, front ? shirt : shade(shirt, 0.84)); disc(g, ex, ey - 0.4, 2.6, 2.3, shade(shirt, 0.8)); disc(g, ex, ey + 1, 2.3, 2.3, skin); return [ex, ey]; }; // a sleeve with a shoulder and a cuff, and a hand
  const waveA = K.wave ? -2.6 + Math.sin(K.wave) * 0.5 : null;
  arm(-K.dir, st ? Math.sin(st) * 0.7 * K.dir : 0.14, false);
  // torso: a chunky bean, cool shade at the lower right
  rr(g, -6.4, -21 + by, 12.8, 13, 5.8, shd(shirt)); rr(g, -6.4, -21 + by, 11.4, 11.8, 5.8, shirt);
  { const alpha0 = fade(g, 0.4); rr(g, -4.6, -19.8 + by, 3.4, 5.4, 1.7, hi(shirt, 0.8)); g.globalAlpha = alpha0; }
  g.save(); g.translate(0, by); if (R.torso && A.mid > 0.02) torsoExtra(g, R.torso, K); g.restore();
  if (K.jacket) { rr(g, -0.7, -20 + by, 1.4, 11, 0.7, shd(shirt)); }
  // front arm (waves when told to), hand item
  let hand;
  if (waveA !== null) { const sxp = K.dir * 6.4, sy = -19.4 + by, ex = sxp + K.dir * 5.2 + Math.sin(K.wave * 1.2) * 2.4, ey = sy - 5.5; bar(g, sxp, sy, ex, ey, 3.7, shirt); disc(g, ex, ey - 0.6, 2.2, 2.2, skin); hand = null; }
  else hand = arm(K.dir, st ? -Math.sin(st) * 0.7 * K.dir : -0.14, true);
  if (hand && R.item && A.face > 0.02 && R.item !== 'backpack') { const p = g.globalAlpha; g.globalAlpha = p * A.face; item(g, R.item, K, hand[0], hand[1]); g.globalAlpha = p; }
  // head
  g.save(); g.translate(0, by * 0.8);
  disc(g, -7.5, -26, 1.7, 2, SKIN_SH(skin)); disc(g, 7.5, -26, 1.7, 2, SKIN_SH(skin));
  disc(g, 0, -26.4, 7.7, 7.7, SKIN_SH(skin)); disc(g, -0.5, -26.9, 7.2, 7.2, skin);
  { const alpha0 = fade(g, 0.4); disc(g, -3, -30, 2.4, 1.4, hi(skin, 0.85)); g.globalAlpha = alpha0; }
  if (A.mid > 0.02) { if (covered) { disc(g, -7.2, -27.4, 2.3, 2.6, K.hair); disc(g, 7.2, -27.4, 2.3, 2.6, shd(K.hair)); } else hairFront(g, K.style, K.hair); }
  face(g, K, A);
  if (R.face && A.face > 0.02) { const p = g.globalAlpha; g.globalAlpha = p * A.face; glasses(g, R.face, K.gaze); g.globalAlpha = p; }
  if (R.head && A.mid > 0.02) hat(g, R.head, K, A);
  g.restore();
  g.restore();
}
const ball = (g, x, y, r, c) => { disc(g, x, y, r, r, shd(c)); disc(g, x - r * 0.12, y - r * 0.14, r * 0.86, r * 0.86, c); { const alpha0 = fade(g, 0.5); disc(g, x - r * 0.38, y - r * 0.44, r * 0.3, r * 0.2, hi(c, 0.85)); g.globalAlpha = alpha0; } };

// ---------------------------------------------------------------- the pose of the moment
const BAG = [TOY.pink, TOY.violet, TOY.cyan, TOY.orange];
const HAT = ['#ff7a63', '#4aa0f0', '#7f7bf0', '#52cf7c', '#ff9a3a', '#b383f0'];
const POSE = { dir: 1, gaze: 0, look: 0, mood: 'neutral', step: 0, bob: 0, blink: false, wave: 0, arm: 0, jacket: false };
/** Fill the reusable pose record of a buyer or the player from its look, its place in time and what is happening to it. No allocation. */
function poseOf(K, look, t, o) {
  K.shirt = look.shirt; K.pants = look.pants; K.skin = look.skin; K.hair = look.hair; K.style = look.style; K.role = look.role; K.dir = o.dir || 1; K.gaze = o.gaze || 0; K.look = 0;
  K.hatCol = HAT[((look.ph * 997) | 0) % HAT.length]; K.boldCol = HAT[((look.ph * 313) | 0) % HAT.length]; K.bagCol = BAG[((look.ph * 71) | 0) % BAG.length];
  K.mood = o.mood || 'neutral'; K.blink = blinkOf(t, look.blinkEvery, look.ph);
  K.step = o.moving && t ? (t / 450) * Math.PI * 2 + look.ph * 6 : 0;
  K.bob = t ? (o.moving ? Math.abs(Math.sin(K.step)) * 1.2 : Math.sin((t / 2800) * Math.PI * 2 + look.ph * 6) * 0.4 + 0.4) : 0;
  K.wave = o.wave && t ? (t / 1200) * Math.PI * 2 : 0; K.arm = 0; K.jacket = !!o.jacket;
  return K;
}
const KBUF = { ...POSE };
const A3 = { mid: 1, face: 1, fine: 0 };
const detailOf = (env, out = A3) => { const d = env.lod ? env.lod.detail : null; out.mid = d ? d[1] : 1; out.face = d ? d[2] : 1; out.fine = d ? d[3] : 0; return out; };

// ---------------------------------------------------------------- the buyers
/** The glow a waiting buyer who is in a hurry stands in: a soft warm disc that breathes, not a flat ring. */
function pulse(g, x, y, k, col) { const r = 14 + 2.4 * k; { const alpha0 = fade(g, 0.28 + 0.16 * k); disc(g, x, y + 0.5, r, r * 0.5, col); g.globalAlpha = alpha0; } { const alpha0 = fade(g, 0.3); disc(g, x, y + 0.5, r * 0.62, r * 0.31, '#fff2bd'); g.globalAlpha = alpha0; } }
function drawLeadV2(ctx, view, env, w, e) {
  const z = zAt(e.x, e.y), [x, y] = P(e.x, e.y, z), B = BUYERS[e.seg], l = e.lead, hov = w.hover && w.hover.eid === e.id, t = env.t, pl = w.player;
  const V = e.v2 || (e.v2 = { look: lookV2(e), nextHop: 0, hopAt: -1, stopAt: -1, was: false, near: false });
  const a = !t ? (e.leaving ? 0 : 1) : leadAlpha(e.born, e.leaving ? e.leaveAt : null, w.t); // (under reduced motion, t is 0: nothing fades, a buyer that is leaving is simply gone)
  if (a <= 0.004) return;
  if (a < 1) ctx.globalAlpha = a;
  const zoom = w.cam.z;
  if (env.far) { // a pill in the shirt colour (a golden one when the buyer is in a hurry), 5 by 8 screen pixels
    const pw = clamp(5 / zoom, 5, 11), ph = clamp(8 / zoom, 8, 19);
    rr(ctx, x - pw / 2, y - ph, pw, ph, pw / 2, l && l.need ? '#ffd36e' : V.look.shirt); disc(ctx, x, y - ph - pw * 0.2, pw * 0.55, pw * 0.55, V.look.skin); ctx.globalAlpha = 1;
  } else {
    const A = detailOf(env), K = KBUF; let hop = 0, sy = 1, sx = 1, gaze = 0;
    const calm = !t; if (!calm) {
      const near = noticeOf(pl.x - e.x, pl.y - e.y) > 0 && !e.leaving; gaze = near ? clamp((pl.x - pl.y - (e.x - e.y)) * 0.5, -1, 1) * 1.3 : 0;
      if (near && !V.near) { if (t >= V.nextHop) { V.hopAt = t; V.nextHop = t + 20000 + h2(strHashOf(e.id), (t / 20000) | 0) * 20000; } } V.near = near;
      if (e.leaving && V.leftAt === undefined) { V.leftAt = t; V.hopAt = t; }
      if (V.was && !e.moving) V.stopAt = t; V.was = !!e.moving;
      const hp = hopOf(t, V.hopAt), sq = squashOf(t, V.stopAt); hop = hp.h; sy = hp.sy * sq.sy; sx = hp.sx * sq.sx;
    }
    const leavingHappy = e.leaving && V.leftAt !== undefined && t - V.leftAt < 1400, need = l && l.need && !e.leaving;
    if (need && !calm) pulse(ctx, x, y, 0.5 + 0.5 * Math.sin(t / 450), '#ffb347'); else if (need) pulse(ctx, x, y, 0.5, '#ffb347');
    poseOf(K, V.look, t, { dir: e.dir || 1, gaze, moving: e.moving, mood: leavingHappy || hov ? 'smile' : need ? 'o' : 'neutral', wave: (need || leavingHappy) && !calm });
    const s = hov ? 1.08 : 1;
    ctx.save(); ctx.translate(x, y - hop - (hov ? 1.5 : 0)); ctx.scale(sx, sy); drawDoll(ctx, 0, 0, s, K, A); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (!e.leaving && l) w.hits.push({ eid: e.id, kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${B.name}${l.need ? ', urgent' : ''}`, circle: [x, y - 16, 20], lead: l });
  const ba = !l ? 0 : !t ? (e.leaving ? 0 : 1) : bubbleAlpha(e.born, e.leaving ? e.leaveAt : null, w.t); // the request comes in a beat after its buyer and goes out over half a second when the lead does: it does not pop on and off
  if (ba > 0.01 && (zoom > 0.5 || hov)) w.overlay.push({ k: 'bub', n: 6, wx: x, wy: y - 46, draw: (g, px, py, s) => { const pa = g.globalAlpha; g.globalAlpha = pa * ba; w.leadBubble(g, px, py, s, B, l, hov && !e.leaving); g.globalAlpha = pa; } });
}
const strHashOf = (id) => strHash(String(id));
registerLayer('lead', drawLeadV2, 'inherit');

// ---------------------------------------------------------------- the player
export const PLAYER = Object.freeze({ shirt: TOY.red, pants: '#4a5a9a', skin: '#f3c08f', hair: '#6b3f24', style: 'short', role: { head: 'beanie', torso: 'scarf' }, ph: 0.37, blinkEvery: 4300 });
const BEANIE = '#3ad4b6'; // the player's beanie: the one teal thing on the island
function drawPlayerV2(ctx, view, env, w) {
  const pl = w.player, z = zAt(pl.x, pl.y), [x, y] = P(pl.x, pl.y, z), t = env.t, zoom = w.cam.z, V = pl.v2 || (pl.v2 = { stopAt: -1, was: false });
  const k = t ? 0.5 + 0.5 * Math.sin((t / 2800) * Math.PI * 2) : 0.5;
  // the soft golden disc under the feet (it breathes over 2.8 s), and a chevron above the head while the doll is small
  ctx.globalAlpha = 0.3 + 0.1 * k; disc(ctx, x, y + 0.5, 15 + 1.2 * k, 7.6 + 0.6 * k, '#ffd36e'); ctx.globalAlpha = 0.45; disc(ctx, x, y + 0.5, 9.5, 4.8, '#fff2bd'); ctx.globalAlpha = 1;
  if (env.far) { const pw = clamp(6 / zoom, 6, 13), ph = clamp(10 / zoom, 10, 22); rr(ctx, x - pw / 2, y - ph, pw, ph, pw / 2, TOY.red); disc(ctx, x, y - ph - pw * 0.25, pw * 0.6, pw * 0.6, '#ffd84d'); }
  else {
    const A = detailOf(env), K = KBUF; let sy = 1, sx = 1;
    if (t) { if (V.was && !pl.moving) V.stopAt = t; V.was = !!pl.moving; const sq = squashOf(t, V.stopAt); sy = sq.sy; sx = sq.sx; }
    poseOf(K, PLAYER, t, { dir: pl.dir || 1, moving: pl.moving, mood: 'smile', jacket: true }); K.hatCol = BEANIE;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); drawDoll(ctx, 0, 0, 1.24, K, A); ctx.restore();
    if (A.mid > 0.02 && zoom > 0.6) { // the paperclip pin on the beanie's cuff: a small silver clip, tilted, with its two loops
      const sgn = pl.dir || 1, px = x + sgn * 3.4 * 1.24, py = y - 33.2 * 1.24 * sy; ctx.globalAlpha = A.face; ctx.save(); ctx.translate(px, py); ctx.rotate(0.4 * sgn); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [c, lw] of [['#2c2a56', 3.4], ['#eef2fb', 1.7]]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-1.5, 2.6); ctx.lineTo(-1.5, -2.6); ctx.arc(0, -2.6, 1.5, Math.PI, 0); ctx.lineTo(1.5, 2.4); ctx.arc(-0.1, 2.4, 1.6, 0, Math.PI); ctx.lineTo(-0.1, -1.4); ctx.stroke(); }
      ctx.restore(); ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    }
  }
  w.overlay.push({ k: 'chip', lo: 1, n: 3, wx: x, wy: y - 56, draw: (g, px, py, s) => w.chip(g, px, py, 'You', '#ffd36e', s) });
}
registerLayer('player', drawPlayerV2, 'inherit');
