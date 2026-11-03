// The people of the toy island in the author's second art direction (docs/ART_DIRECTION.md, "People: flat figures"): matte but vibrant flat fills with a light flat shading, no outline, no gradient, no highlight, the silhouette
// carries the figure (a small head, thin long limbs, oversized clothes, smallish chunky shoes), a few silhouettes so a crowd does not look cloned. No canvas: the recording context of tests/helpers/recctx.mjs, with the colours of a
// figure set to markers (#010101, #020202 ...) so that the test finds the head, the legs and the arms by the colour they are filled with and measures what the drawing really paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';

const fig = await import('../js/world/figure.js'), ch = await import('../js/world/characters.js'), pal = await import('../js/world/palette.js'), stack = await import('../js/world/stack.js'),
  lay = await import('../js/world/layout.js'), { lodOf } = await import('../js/world/lod.js'), cfg = await import('../js/config.js'), { lookOf } = await import('../js/world/ents-actors.js');
const A_ALL = { mid: 1, face: 1, fine: 1 };
const M = { shirt: '#e01010', pants: '#1060e0', skin: '#10c010', hair: '#d0c010', shoe: '#c010c0', sole: '#10c0c0', accent: '#a0a0a0' };
const FAM = Object.fromEntries(Object.entries(M).map(([k, c]) => [k, new Set([c, fig.TONE.dk(c), fig.TONE.skd(c), fig.TONE.dk(fig.TONE.dk(c))])])); // a part and its darker tones (the far sleeve's cuff is a step darker than the far sleeve)
assert.equal(new Set(Object.values(FAM).flatMap((f) => [...f])).size, Object.values(FAM).reduce((n, f) => n + f.size, 0), 'the marker families do not meet');
const partOf = (style) => Object.keys(FAM).find((k) => FAM[k].has(style)) || null;
const LOOK = { ...M, style: 'short', build: 'tee', legs: 'trousers', mark: 'plain', role: {}, ph: 0.2, blinkEvery: 4000, seg: 'x' };
const pose = (look, o = {}, t = 0) => ch.poseOf({}, { ...LOOK, ...look }, t, { dir: 1, ...o });

// What a recording painted: every filled shape with the colour and alpha it was filled in and the box of its points (arcs and ellipses by their whole circle: a limb is two half circles, a head one ellipse).
function shapesOf(log) {
  const out = []; let pts = [], k = 0; const add = (x, y) => pts.push([x, y]);
  for (const [name, ...a] of log.calls) {
    if (name === 'beginPath') pts = [];
    else if (name === 'moveTo' || name === 'lineTo' || name === 'quadraticCurveTo') { add(a[0], a[1]); if (name === 'quadraticCurveTo') add(a[2], a[3]); }
    else if (name === 'arc') { add(a[0] - a[2], a[1] - a[2]); add(a[0] + a[2], a[1] + a[2]); }
    else if (name === 'ellipse') { add(a[0] - a[2], a[1] - a[3]); add(a[0] + a[2], a[1] + a[3]); }
    else if (name === 'arcTo') { add(a[0], a[1]); add(a[2], a[3]); }
    else if (name === 'rect') { add(a[0], a[1]); add(a[0] + a[2], a[1] + a[3]); }
    else if (name === 'fill') { const f = log.fills[k++]; if (pts.length) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); out.push({ style: f.style, part: partOf(f.style), alpha: f.alpha, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); } }
  }
  return out.map((s) => ({ ...s, w: s.x1 - s.x0, h: s.y1 - s.y0 }));
}
const BANNED = new Set(['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'stroke', 'strokeRect', 'strokeText', 'fillText', 'fillRect']);
/** A recording context that notes every gradient, pattern, stroke, blur and filter asked of it: a flat figure asks for none. */
function flatCtx() {
  const r = recCtx(), bad = [];
  const ctx = new Proxy(r.ctx, { get(o, k) { if (BANNED.has(k)) bad.push(k); return o[k]; }, set(o, k, v) { if ((k === 'shadowBlur' && v) || (k === 'filter' && v && v !== 'none') || (k === 'shadowColor' && v && v !== 'rgba(0,0,0,0)')) bad.push(k); o[k] = v; return true; } });
  return { ...r, ctx, bad };
}
const figureOf = (look, o, s = 1, A = A_ALL, t = 0) => { const r = flatCtx(), K = pose(look, o, t); fig.drawFigure(r.ctx, 0, 0, s, K, A); return { ...r, shapes: shapesOf(r.log) }; };
const bare = (shapes) => shapes.filter((s) => s.alpha === 1); // without the ground shadow, which is the one translucent shape of a figure
const box = (shapes) => ({ y0: Math.min(...shapes.map((s) => s.y0)), y1: Math.max(...shapes.map((s) => s.y1)), x0: Math.min(...shapes.map((s) => s.x0)), x1: Math.max(...shapes.map((s) => s.x1)) });
const hsv = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); return { s: mx ? (mx - mn) / mx : 0, v: mx }; };

// ---------------------------------------------------------------- proportions
test('a figure is about 35 world pixels from the soles to the crown, drawn at 1.1 so a buyer is about 39 on the screen (the doll it replaces was 34 and 42 with the player), and the player is a sixth taller', () => {
  const f = figureOf({ role: {} }), b = box(bare(f.shapes)), h = b.y1 - b.y0;
  assert.ok(h >= 34 && h <= 37.5, `a buyer is ${h} tall`); assert.ok(b.y1 <= 0.6 && b.y1 >= -0.6, `the soles stand on the ground line (${b.y1})`);
  assert.equal(fig.DIM.height, 35);
  const p = { ...ch.PLAYER, role: {} }, r = flatCtx(), K = pose(p, {}); fig.drawFigure(r.ctx, 0, 0, 1.2, K, A_ALL); const sc = r.log.calls.find((c) => c[0] === 'scale'); assert.deepEqual(sc.slice(1), [1.2, 1.2]);
  { const D = lay.DIST[1], X = D.cx + 2, Y = D.cy + 2, W = (o = {}) => ({ hover: null, t: 0, vt: 0, cam: { z: 1 }, hits: [], overlay: [], player: { x: X + 8, y: Y + 6, dir: 1, moving: false, path: [] }, reduced: () => true, leadBubble() {}, chip() {}, ...o }), e = { id: 'lead:s', type: 'lead', zone: 1, x: X, y: Y, seg: 'student', dir: 1, moving: false, leaving: false, born: -1e6, lead: null }, ev = { t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, hz: 0, lod: lodOf(1.0) };
    stack.setFlags('lead:v2,player:v2'); const a = recCtx(), b2 = recCtx(); stack.slotFor('lead').draw(a.ctx, null, ev, W(), e); stack.slotFor('player').draw(b2.ctx, null, ev, W());
    assert.ok(a.log.calls.some((c) => c[0] === 'scale' && c[1] === ch.SCALE.buyer && c[2] === ch.SCALE.buyer), 'a buyer is drawn at SCALE.buyer'); assert.ok(b2.log.calls.some((c) => c[0] === 'scale' && c[1] === ch.SCALE.player), 'the player at SCALE.player'); stack.setFlags('all:legacy'); }
  const ph = box(bare(shapesOf(r.log))); assert.ok((ph.y1 - ph.y0) * ch.SCALE.player >= 44 && (ph.y1 - ph.y0) * ch.SCALE.player <= 47.5, `the player is ${(ph.y1 - ph.y0) * ch.SCALE.player} tall`); assert.ok(h * ch.SCALE.buyer >= 38 && h * ch.SCALE.buyer <= 41, `a buyer is ${h * ch.SCALE.buyer} tall on the screen`);
  assert.ok(ch.SCALE.player / ch.SCALE.buyer >= 1.12 && ch.SCALE.player / ch.SCALE.buyer <= 1.22);
});
test('the head is small: its height is under a quarter of the figure\'s, and under the width of the clothes', () => {
  for (const build of fig.BUILDS) {
    const f = figureOf({ build }), sk = bare(f.shapes).filter((s) => s.part === 'skin' && s.w >= 5 && s.h >= 6), H = box(bare(f.shapes)), total = H.y1 - H.y0; assert.equal(sk.length, 2, `${build}: the head is a shade and a lit ellipse`); const hb = box(sk), head = { w: hb.x1 - hb.x0, h: hb.y1 - hb.y0 };
    assert.ok(head.h / total <= 0.24, `${build}: head ${head.h} of ${total}`); assert.ok(head.h >= 6, `${build}: a head of ${head.h} px can still be seen`); assert.ok(head.w < head.h + 0.5, 'a head is not wider than it is tall');
    const cb = box(bare(f.shapes).filter((s) => s.part === 'shirt')), cloth = cb.x1 - cb.x0; assert.ok(cloth >= 1.9 * head.w, `${build}: the clothes (${cloth}) are oversized against the head (${head.w})`);
  }
});
test('the limbs are thin and long: a leg and a bare arm are at least four times as long as they are wide, and the shoes are chunky against them', () => {
  for (const legs of fig.LEGS) {
    const f = figureOf({ legs, build: 'tee' }), S = bare(f.shapes), longs = S.filter((s) => (s.part === 'pants' || s.part === 'skin') && s.h >= 8 && s.h > s.w);
    assert.ok(longs.length >= 4, `${legs}: two legs and two arms (${longs.length})`);
    for (const l of longs) { assert.ok(l.w <= 3.4, `${legs}: a limb ${l.w} wide`); assert.ok(l.h / l.w >= 4, `${legs}: a limb ${l.h} long and ${l.w} wide`); }
    const shoes = S.filter((s) => s.part === 'shoe'); assert.ok(shoes.length >= 2, 'two shoes'); for (const sh of shoes) assert.ok(sh.w <= 7 && sh.w >= 5.5, `${legs}: a shoe is ${sh.w} wide: smallish, still chunky`); for (const sh of shoes) assert.ok(sh.w >= 1.9 * Math.min(...longs.map((l) => l.w)), `${legs}: a shoe ${sh.w} wide against a limb ${Math.min(...longs.map((l) => l.w))}`);
  }
});
test('every garment is a silhouette of its own: the builds differ in width and in length, and none is narrower than a shoulder-wide box', () => {
  const seen = new Set();
  for (const build of fig.BUILDS) { const S = bare(figureOf({ build }).shapes).filter((s) => s.part === 'shirt'), b = box(S); seen.add(`${Math.round((b.x1 - b.x0) * 2) / 2}x${Math.round((b.y1 - b.y0) * 2) / 2}`); assert.ok(b.x1 - b.x0 >= 10, `${build} is ${b.x1 - b.x0} wide`); }
  assert.equal(seen.size, fig.BUILDS.length, `distinct silhouettes: ${[...seen].join(' ')}`); assert.ok(fig.BUILDS.length >= 6, 'a jacket, a puffer, a poncho, a hoodie, a sweater and a tee at the least');
  for (const need of ['jacket', 'puffer', 'poncho', 'hoodie', 'sweater', 'tee']) assert.ok(fig.BUILDS.includes(need), need);
  for (const need of ['trousers', 'shorts']) assert.ok(fig.LEGS.includes(need), need);
});
test('the shading is light and flat: a darker copy of the garment, the head and a hat shows as a rim on the lower right, the lit one covers the upper left, and nothing is a highlight', () => {
  for (const build of fig.BUILDS) {
    const S = bare(figureOf({ build }).shapes).filter((s) => s.part === 'shirt'), dark = S.filter((s) => s.style === fig.TONE.dk(M.shirt)).sort((a, b) => b.w * b.h - a.w * a.h)[0], lit = S.filter((s) => s.style === M.shirt).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    assert.ok(dark && lit, `${build}: a lit garment over a dark one`); assert.ok(dark.x1 - lit.x1 >= 1 && dark.y1 - lit.y1 >= 0.8, `${build}: the shade shows on the lower right (${dark.x1 - lit.x1}, ${dark.y1 - lit.y1})`); assert.ok(lit.x0 < dark.x0 && lit.y0 < dark.y0, `${build}: the light covers the upper left`);
    assert.ok(dark.x1 - lit.x1 <= 2.4 && dark.y1 - lit.y1 <= 2, `${build}: a light shading, a rim of about a pixel and a half (${dark.x1 - lit.x1}, ${dark.y1 - lit.y1})`);
  }
  const f = figureOf({ role: { head: 'beanie' } }), skin = bare(f.shapes).filter((s) => s.part === 'skin' && s.w >= 5 && s.h >= 6).sort((a, b) => a.x1 - b.x1), hat = bare(f.shapes).filter((s) => s.part === null || s.part === 'hair');
  assert.equal(skin.length, 2); assert.ok(skin[1].x1 > skin[0].x1 && skin[1].y1 > skin[0].y1, 'the head: the shade on the lower right'); assert.equal(skin[1].style, fig.TONE.skd(M.skin), 'and it is the darker tone of the skin, not a lighter one'); assert.ok(hat.length > 0);
  for (const sh of bare(f.shapes)) if (sh.part) assert.ok(FAM[sh.part].has(sh.style), 'a part is its colour or a darker tone of it, never a lighter');
  // and no tone of a plain figure is a lighter one: every fill is a part's colour, a darker tone of it, the ink of the eyes or the ground shadow
  const allowed = new Set([...Object.values(FAM).flatMap((x) => [...x]), pal.INK.darkest, pal.LIGHT.shadow]);
  for (const build of ['jacket', 'puffer', 'poncho', 'sweater', 'tee']) for (const legs of fig.LEGS) for (const style of ['short', 'long', 'curly', 'pony']) for (const o of [{}, { wave: true }]) {
    const g = figureOf({ build, legs, style }, o, 1, A_ALL, o.wave ? 1000 : 0); for (const sh of g.shapes) assert.ok(allowed.has(sh.style), `${build} ${legs} ${style}: ${sh.style} is a tone that is neither a part's own nor a darker step of it`);
  }
});
test('no garment can throw a spike: every rounded corner keeps its tangent points inside the half of each edge it joins (a corner that asks arcTo to reach past an edge draws a long sliver, as the poncho did)', () => {
  for (const [name, G] of Object.entries(fig.GARMENT)) {
    const n = G.corners.length; assert.ok(n >= 8, `${name}: ${n} corners`);
    G.corners.forEach((c, i) => {
      const next = G.corners[(i + 1) % n], edge = Math.hypot(next[0] - c[0], next[1] - c[1]), out = Math.hypot(c[4] - c[0], c[5] - c[1]), back = Math.hypot(next[2] - next[0], next[3] - next[1]);
      assert.ok(c.every(Number.isFinite) && c[6] >= 0, `${name} corner ${i}: ${c}`); assert.ok(out + back <= edge + 1e-9, `${name}: the tangents of corners ${i} and ${(i + 1) % n} (${out.toFixed(2)} + ${back.toFixed(2)}) overlap on an edge of ${edge.toFixed(2)}`);
      assert.ok(c[6] <= G.r + 1e-9, `${name} corner ${i}: radius ${c[6]} over the garment's ${G.r}`);
    });
  }
});
test('no hat or thing worn reaches into the request bubble: the tallest is under 46 world pixels, the width of the figure under 30', () => {
  const hats = new Set(); for (const seg of Object.keys(cfg.BUYERS)) { const r = ch.roleOf(seg, cfg.BUYERS[seg].like); if (r.head) hats.add(r.head); } for (const r of Object.values(ch.NAMED)) if (r.head) hats.add(r.head);
  assert.ok(hats.size >= 12, `${hats.size} kinds of hat`);
  for (const head of hats) for (const style of ['short', 'bun', 'curly', 'pony']) { const f = figureOf({ role: { head }, style }), b = box(bare(f.shapes)); assert.ok(b.y0 * ch.SCALE.buyer >= -46, `${head}/${style} reaches ${b.y0 * ch.SCALE.buyer} on the screen`); assert.ok(b.x1 - b.x0 <= 30, `${head} is ${b.x1 - b.x0} wide`); }
});

// ---------------------------------------------------------------- flat, outline-less, matte
test('a figure is flat fills only: no stroke, no gradient, no pattern, no blur; every fill an opaque six-digit colour but the ground shadow; a handful of tones', () => {
  const roles = new Map(); for (const seg of Object.keys(cfg.BUYERS)) { const r = ch.roleOf(seg, cfg.BUYERS[seg].like); roles.set(JSON.stringify(r), r); } for (const r of Object.values(ch.NAMED)) roles.set(JSON.stringify(r), r); roles.set(JSON.stringify(ch.PLAYER.role), ch.PLAYER.role);
  assert.ok(roles.size >= 25, `${roles.size} outfits`);
  for (const role of roles.values()) for (const build of fig.BUILDS) for (const [legs, mark] of fig.LEGS.map((l, i) => [l, fig.MARKS[i]])) for (const wave of [false, true]) {
    const l = { ...LOOK, shirt: '#2f5fe8', pants: '#ff6fae', skin: '#dca070', hair: '#3a2a22', accent: '#ffd84d', shoe: '#2c2a56', sole: '#fffaf0', role, build, legs, mark, style: 'bun' }, f = flatCtx(), K = ch.poseOf({}, l, 1500, { dir: -1, moving: true, mood: 'smile', wave, gaze: 0.5 });
    fig.drawFigure(f.ctx, 0, 0, 1, K, A_ALL); const S = shapesOf(f.log), tag = `${JSON.stringify(role)} ${build} ${legs} ${mark} ${wave ? 'waving' : ''}`;
    assert.deepEqual(f.bad, [], tag); assert.equal(f.log.strokes.length, 0, `${tag}: a stroke`); assert.equal(f.log.depth, 0, `${tag}: save and restore balance`); assert.equal(f.state.globalAlpha, 1, `${tag}: the alpha is whole again`);
    assert.equal(f.log.fills.length, S.length, `${tag}: every fill is a path`); for (const x of f.log.fills) assert.match(x.style, /^#[0-9a-f]{6}$/, `${tag}: ${x.style}`);
    assert.ok(S.filter((s) => s.alpha !== 1).length <= 1, `${tag}: only the shadow is translucent`); assert.equal(S[0].alpha < 1, true, 'the shadow comes first'); assert.ok(new Set(S.map((s) => s.style)).size <= (Object.keys(role).length ? 28 : 16), `${tag}: ${new Set(S.map((s) => s.style)).size} tones`);
    assert.ok(S.length <= 60, `${tag}: ${S.length} fills`); // (the doll it replaced took up to 66, and median 47)
  }
});
test('the lead and the player layers keep to it too: no stroke at any zoom of the ladder, with and without the motion, urgent or not', () => {
  const D = lay.DIST[1], X = D.cx + 2, Y = D.cy + 2;
  const w = (o = {}) => ({ hover: null, t: 0, vt: 0, far: false, cam: { z: 1 }, hits: [], overlay: [], player: { x: X + 8, y: Y + 6, dir: 1, moving: false, path: [] }, env: { tariff: false }, api: { ui: { sel: new Set() } }, reduced: () => true, leadBubble() {}, chip() {}, ...o });
  stack.setFlags('lead:v2,player:v2');
  for (const zoom of [0.2, 0.5, 1.0, 1.6, 2.4]) for (const t of [0, 7777]) for (const need of [false, true]) {
    const r = recCtx(), e = { id: 'lead:q' + need, type: 'lead', zone: 1, x: X, y: Y, seg: 'mechanic', dir: -1, moving: t > 0, leaving: false, born: -1e6, look: lookOf('qmechanic'), lead: { id: 'q', need, budget: 9, born: 0 } }, env = { t, night: 0, wind: 0, dim: 0, far: zoom < 0.3, lite: false, lights: [], zoff: 0, hz: 0, lod: lodOf(zoom) };
    stack.slotFor('lead').draw(r.ctx, null, env, w({ t, vt: t, cam: { z: zoom } }), e); stack.slotFor('player').draw(r.ctx, null, env, w({ t, vt: t, cam: { z: zoom } }));
    assert.equal(r.log.strokes.length, 0, `zoom ${zoom}, t ${t}, need ${need}: ${r.log.strokes.length} strokes`); assert.equal(r.log.depth, 0); assert.equal(r.state.globalAlpha, 1);
  }
  stack.setFlags('all:legacy');
});
test('the urgent buyer keeps the highlight it had: a warm disc under the feet that breathes, and an arm that waves; a calm one has neither', () => {
  const calm = figureOf({}, { wave: true }), wave = figureOf({}, { wave: true }, 1, A_ALL, 1000); // (a wave stands still when time does; the pulse itself is the layer's: below)
  const raised = (f) => Math.min(...bare(f.shapes).filter((s) => s.part === 'skin' && s.w <= 4 && s.h <= 4).map((s) => s.y0)); assert.ok(raised(wave) < raised(calm) - 15, `a waving hand is far above a hanging one (${raised(wave)} against ${raised(calm)})`);
  const D = lay.DIST[1], X = D.cx + 2, Y = D.cy + 2; stack.setFlags('lead:v2');
  const draw = (need) => { const r = recCtx(); stack.slotFor('lead').draw(r.ctx, null, { t: 5000, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, hz: 0, lod: lodOf(1.6) }, { hover: null, t: 5000, vt: 5000, cam: { z: 1.6 }, hits: [], overlay: [], player: { x: X + 9, y: Y + 9, dir: 1, moving: false, path: [] }, reduced: () => false, leadBubble() {} },
    { id: 'lead:u', type: 'lead', zone: 1, x: X, y: Y, seg: 'student', dir: 1, moving: false, leaving: false, born: -1e6, look: lookOf('ustudent'), lead: { id: 'u', need, budget: 9, born: 0 } }); return r.log.fills.filter((x) => x.style === '#ffb347').length; };
  assert.ok(draw(true) >= 1, 'a pulse in the warm gold'); assert.equal(draw(false), 0); stack.setFlags('all:legacy');
});

// ---------------------------------------------------------------- the crowd: a vibrant palette and a few silhouettes, from bounded sets
test('the palette is vibrant: every shirt is saturated, nearly every trouser is, and the player\'s tomato jacket is on no buyer', () => {
  assert.ok(pal.PEOPLE.shirts.length >= 12 && pal.PEOPLE.pants.length >= 6 && pal.PEOPLE.hair.length >= 6, 'a wide palette');
  for (const c of pal.PEOPLE.shirts) { const q = hsv(c); assert.ok(q.s >= 0.55 && q.v >= 0.5, `${c}: s ${q.s.toFixed(2)} v ${q.v.toFixed(2)}`); assert.notEqual(c.toLowerCase(), pal.TOY.red.toLowerCase()); }
  const dull = pal.PEOPLE.pants.filter((c) => hsv(c).s < 0.45); assert.ok(dull.length <= 2, `${dull.length} dull trousers: ${dull}`);
  for (const sh of pal.PEOPLE.shoes) { assert.equal(sh.length, 2); for (const c of sh) assert.match(c, /^#[0-9a-f]{6}$/); }
});
test('a crowd is not cloned: every build, leg and mark, hair style, shirt and shoe shows up, from bounded sets, and nobody wears one colour from head to toe', () => {
  const combos = new Set(), builds = new Map(), shirts = new Set(), styles = new Set(), shoes = new Set(), pants = new Set(); const N = 3000;
  for (let i = 0; i < N; i++) {
    const l = ch.lookV2({ id: 'lead:' + i, lead: { id: 'id' + i }, seg: Object.keys(cfg.BUYERS)[i % 101] });
    combos.add(`${l.build}|${l.legs}|${l.mark}`); builds.set(l.build, (builds.get(l.build) || 0) + 1); shirts.add(l.shirt); styles.add(l.style); shoes.add(l.shoe + l.sole); pants.add(l.pants);
    assert.ok([...fig.BUILDS, 'coat'].includes(l.build) && fig.LEGS.includes(l.legs) && fig.MARKS.includes(l.mark), 'from the lists'); assert.notEqual(l.pants, l.shirt, 'no one wears one colour'); assert.notEqual(l.accent, l.shirt);
    assert.ok(pal.PEOPLE.shirts.includes(l.shirt) && pal.PEOPLE.pants.includes(l.pants) && pal.PEOPLE.hair.includes(l.hair) && pal.PEOPLE.skin.includes(l.skin));
  }
  assert.ok(combos.size <= (fig.BUILDS.length + 1) * fig.LEGS.length * fig.MARKS.length, `${combos.size} silhouettes: bounded by the lists`); assert.ok(combos.size >= 24, `${combos.size} silhouettes in a crowd`);
  for (const b of fig.BUILDS) assert.ok((builds.get(b) || 0) / N >= 0.06, `${b} is ${(100 * (builds.get(b) || 0) / N).toFixed(1)}% of a crowd`);
  assert.equal(shirts.size, pal.PEOPLE.shirts.length, 'every shirt'); assert.ok(styles.size >= 6, `${styles.size} hair styles`); assert.ok(shoes.size >= 3 && shoes.size <= pal.PEOPLE.shoes.length, `${shoes.size} pairs of shoes`); assert.ok(pants.size >= 6);
});
test('the outfit of a role decides the build where it must (a white coat is a long coat, a vcstart is in a hoodie), and a look is the same every time', () => {
  const l = (seg) => ch.lookV2({ id: 'lead:k', lead: { id: 'k' }, seg }); assert.equal(l('vcstart').build, 'hoodie'); assert.deepEqual(l('student'), l('student'));
  const med = Object.keys(cfg.BUYERS).find((s) => ch.roleOf(s, cfg.BUYERS[s].like).torso === 'coat'); assert.ok(med, 'a buyer in a white coat'); assert.equal(l(med).build, 'coat');
  assert.equal(ch.PLAYER.build, 'jacket'); assert.equal(ch.PLAYER.shirt, pal.TOY.red);
});
test('the legacy look the fallback path reads comes from the same vibrant palette', () => {
  for (let i = 0; i < 200; i++) { const l = lookOf('id' + i + 'seg'); assert.ok(pal.PEOPLE.shirts.includes(l.shirt) && pal.PEOPLE.pants.includes(l.pants) && pal.PEOPLE.hair.includes(l.hair) && pal.PEOPLE.skin.includes(l.skin), JSON.stringify(l)); }
});
