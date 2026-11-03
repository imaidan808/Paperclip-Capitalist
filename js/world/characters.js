// The people of the toy island: flat figures (a small head, thin long limbs, oversized clothes, chunky shoes, a minimal face; matte but vibrant fills, no outline), their outfits by role, their clock (hop, squash, blink,
// notice) and the V2 drawers of the buyers (`lead` layer) and the player (`player` layer). The figure itself is drawn by figure.js.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.4 (the figure: 35 world pixels from the soles to the crown, drawn at SCALE.buyer 1.1 and the player at 1.28; a head a fifth of the height, a limb four or five times as
// long as it is wide), 4.4 (the player: tomato jacket, cream scarf, denim, a teal beanie with a paperclip pin; buyers: the palette of 2.6, a silhouette from the lists of figure.js and an accessory by role, the seventeen named originals
// override the rule; an urgent buyer waves and stands in a golden pulse, never a flat ellipse), 7.5 and 8.1 (idle bob 2.8 s, blink every 3 to 6 s for 80 ms, a hop when a buyer notices the player, squash and stretch,
// a step cycle of 0.45 s; every motion stands still under Calm, Off and reduced motion, with open eyes and a neutral mouth).
//
// What is drawn by band (env.lod): far is a pill in the shirt colour; mid is the body, hair and hat; near adds the face and what is held; close adds the mouth states and the blink. All of it is a function of
// the world's own clock (env.t, which is 0 when motion is reduced) and of where the buyer and the player stand, so a still picture is the same on every draw.
import { registerLayer } from './stack.js';
import { BUYERS } from '../config.js';
import { zAt } from './layout.js';
import { leadAlpha, bubbleAlpha } from './common.js';
import { P, strHash, h2, clamp } from './iso.js';
import { TOY, personLook } from './palette.js';
import { disc, rr, fade } from './toys.js';
import { drawFigure, ROLE_BUILD, BUILDS, LEGS, MARKS, STYLES } from './figure.js';

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
/** One buyer's look, made once and kept on the entity: the palette's shirt, hair, skin, trousers, trim and shoes from the buyer's own hash, a hair style, a garment, legwear and a mark from the lists of figure.js, and the outfit of the role (a role may decide the garment: a white coat, a hoodie). */
export function lookV2(e) {
  const l = e.lead, h = strHash(String((l && l.id) ?? e.id) + String(e.seg)), B = BUYERS[e.seg], base = personLook(h), role = roleOf(e.seg, B && B.like), g = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return { ...base, style: STYLES[(h >>> 16) % STYLES.length], build: ROLE_BUILD[role.torso] || BUILDS[g % BUILDS.length], legs: LEGS[(g >>> 8) % LEGS.length], mark: MARKS[(g >>> 14) % MARKS.length], role, ph: (h % 1000) / 1000, blinkEvery: 3000 + (h % 3000), seg: e.seg };
}

// ---------------------------------------------------------------- the clock of a person
/** A hop: 0 to 1 over 0.35 s from `t0`; answers the height in world pixels (6 at the top) and the stretch (Y 1.08, X 0.94 at the top). */
export function hopOf(t, t0) { const k = (t - t0) / 350; if (!(t0 >= 0) || k < 0 || k > 1) return { h: 0, sy: 1, sx: 1 }; const s = Math.sin(Math.PI * k); return { h: 6 * s, sy: 1 + 0.08 * s, sx: 1 - 0.06 * s }; }
/** The squash of a stop: 0.18 s, Y 0.92 first, a 4% overshoot, then 1; the X scale is the inverse. */
export function squashOf(t, t0) { const k = (t - t0) / 180; if (!(t0 >= 0) || k < 0 || k > 1) return { sy: 1, sx: 1 }; const sy = k < 0.45 ? 1 - 0.08 * Math.sin((k / 0.45) * Math.PI / 2) : 0.92 + 0.12 * Math.sin(((k - 0.45) / 0.55) * Math.PI) * 0.7 + 0.08 * ((k - 0.45) / 0.55); return { sy, sx: 2 - sy }; }
/** Are the eyes shut at time `t` (80 ms every 3 to 6 s)? Open for ever when time stands still. */
export const blinkOf = (t, every, ph) => t > 0 && (t + ph * every) % every < 80;
/** How far a buyer notices the player: within 3.5 tiles, a number 1 at the player's side and 0 at the edge. */
export const noticeOf = (dx, dy) => { const d = Math.hypot(dx, dy); return d < 3.5 ? 1 - d / 3.5 : 0; };

/** The size a person is drawn at (1 is the 35 world pixels of figure.js DIM): a buyer 39 from the soles to the crown, the player a sixth taller; a buyer the pointer is on is 8% bigger. */
export const SCALE = Object.freeze({ buyer: 1.1, player: 1.28 });

// ---------------------------------------------------------------- the pose of the moment
const BAG = [TOY.pink, TOY.violet, TOY.cyan, TOY.orange];
const HAT = ['#ff7a1a', '#2aa2f0', '#7a4df0', '#12b37a', '#f5b800', '#c93fd1'];
const POSE = { dir: 1, gaze: 0, look: 0, mood: 'neutral', step: 0, bob: 0, blink: false, wave: 0 };
/** Fill the reusable pose record of a buyer or the player from its look, its place in time and what is happening to it. No allocation once the record exists. */
export function poseOf(K, look, t, o) {
  K.shirt = look.shirt; K.pants = look.pants; K.skin = look.skin; K.hair = look.hair; K.style = look.style; K.role = look.role; K.build = look.build; K.legs = look.legs; K.mark = look.mark; K.accent = look.accent; K.shoe = look.shoe; K.sole = look.sole;
  K.dir = o.dir || 1; K.gaze = o.gaze || 0; K.look = 0;
  K.hatCol = HAT[((look.ph * 997) | 0) % HAT.length]; K.boldCol = HAT[((look.ph * 313) | 0) % HAT.length]; K.bagCol = BAG[((look.ph * 71) | 0) % BAG.length];
  K.mood = o.mood || 'neutral'; K.blink = blinkOf(t, look.blinkEvery, look.ph);
  K.step = o.moving && t ? (t / 450) * Math.PI * 2 + look.ph * 6 : 0;
  K.bob = t ? (o.moving ? Math.abs(Math.sin(K.step)) * 1.2 : Math.sin((t / 2800) * Math.PI * 2 + look.ph * 6) * 0.4 + 0.4) : 0;
  K.wave = o.wave && t ? (t / 1200) * Math.PI * 2 : 0;
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
    const s = (hov ? 1.08 : 1) * SCALE.buyer;
    ctx.save(); ctx.translate(x, y - hop - (hov ? 1.5 : 0)); ctx.scale(sx, sy); drawFigure(ctx, 0, 0, s, K, A); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (!e.leaving && l) w.hits.push({ eid: e.id, kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${B.name}${l.need ? ', urgent' : ''}`, circle: [x, y - 16, 20], lead: l });
  const ba = !l ? 0 : !t ? (e.leaving ? 0 : 1) : bubbleAlpha(e.born, e.leaving ? e.leaveAt : null, w.t); // the request comes in a beat after its buyer and goes out over half a second when the lead does: it does not pop on and off
  if (ba > 0.01 && (zoom > 0.5 || hov)) w.overlay.push({ k: 'bub', n: 6, wx: x, wy: y - 46, draw: (g, px, py, s) => { const pa = g.globalAlpha; g.globalAlpha = pa * ba; w.leadBubble(g, px, py, s, B, l, hov && !e.leaving); g.globalAlpha = pa; } });
}
const strHashOf = (id) => strHash(String(id));
registerLayer('lead', drawLeadV2, 'inherit');

// ---------------------------------------------------------------- the player
export const PLAYER = Object.freeze({ shirt: TOY.red, pants: '#2f4fb8', skin: '#f3c08f', hair: '#6b3f24', style: 'short', role: { head: 'beanie', torso: 'scarf' }, build: 'jacket', legs: 'trousers', mark: 'plain', accent: '#fffaf0', shoe: '#fffaf0', sole: '#12a8a8', ph: 0.37, blinkEvery: 4300 });
const BEANIE = '#3ad4b6'; // the player's beanie: teal, with the paperclip pin
function drawPlayerV2(ctx, view, env, w) {
  const pl = w.player, z = zAt(pl.x, pl.y), [x, y] = P(pl.x, pl.y, z), t = env.t, zoom = w.cam.z, V = pl.v2 || (pl.v2 = { stopAt: -1, was: false });
  const k = t ? 0.5 + 0.5 * Math.sin((t / 2800) * Math.PI * 2) : 0.5;
  // the soft golden disc under the feet (it breathes over 2.8 s), and a chevron above the head while the figure is small
  ctx.globalAlpha = 0.3 + 0.1 * k; disc(ctx, x, y + 0.5, 15 + 1.2 * k, 7.6 + 0.6 * k, '#ffd36e'); ctx.globalAlpha = 0.45; disc(ctx, x, y + 0.5, 9.5, 4.8, '#fff2bd'); ctx.globalAlpha = 1;
  if (env.far) { const pw = clamp(6 / zoom, 6, 13), ph = clamp(10 / zoom, 10, 22); rr(ctx, x - pw / 2, y - ph, pw, ph, pw / 2, TOY.red); disc(ctx, x, y - ph - pw * 0.25, pw * 0.6, pw * 0.6, '#ffd84d'); }
  else {
    const A = detailOf(env), K = KBUF; let sy = 1, sx = 1;
    if (t) { if (V.was && !pl.moving) V.stopAt = t; V.was = !!pl.moving; const sq = squashOf(t, V.stopAt); sy = sq.sy; sx = sq.sx; }
    poseOf(K, PLAYER, t, { dir: pl.dir || 1, moving: pl.moving, mood: 'smile' }); K.hatCol = BEANIE;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); drawFigure(ctx, 0, 0, SCALE.player, K, A); ctx.restore();
    if (A.mid > 0.02 && zoom > 0.6) { // the paperclip pin on the beanie's cuff: a small silver clip, tilted, two nested loops of flat fill
      const sgn = pl.dir || 1, was = fade(ctx, A.face); ctx.save(); ctx.translate(x + sgn * 2.8 * SCALE.player, y + (-33.6 - K.bob * 0.8) * SCALE.player * sy); ctx.rotate(0.4 * sgn);
      rr(ctx, -1.8, -3.8, 3.6, 7.6, 1.8, '#eef2fb'); rr(ctx, -0.9, -2.9, 1.8, 5.8, 0.9, BEANIE); rr(ctx, -0.45, -1.4, 0.9, 4.2, 0.45, '#eef2fb');
      ctx.restore(); ctx.globalAlpha = was;
    }
  }
  w.overlay.push({ k: 'chip', lo: 1, n: 3, wx: x, wy: y - 56, draw: (g, px, py, s) => w.chip(g, px, py, 'You', '#ffd36e', s) });
}
registerLayer('player', drawPlayerV2, 'inherit');
