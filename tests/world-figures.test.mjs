// T4's people and crates (docs/RENDER_PLAN.md): the dolls of the buyers and the player, their outfits by role, their clock (hop, squash, blink, notice), the V2 drawers of the lead, player, lot, asset, truck and car layers
// and the hit shapes they leave, which are the legacy ones exactly. No canvas: the recording context of tests/helpers/recctx.mjs and a stand-in world with the few members the drawers read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';

const stack = await import('../js/world/stack.js'), ch = await import('../js/world/characters.js'), stock = await import('../js/world/stock.js'), lay = await import('../js/world/layout.js'), iso = await import('../js/world/iso.js'), pal = await import('../js/world/palette.js'),
  cfg = await import('../js/config.js'), { actorMethods, lookOf } = await import('../js/world/ents-actors.js'), { stockMethods } = await import('../js/world/ents-stock.js'), { lodOf } = await import('../js/world/lod.js');
const D = lay.DIST[1], X = D.cx + 2, Y = D.cy + 2;
const mkWorld = (o = {}) => { const w = { hover: null, t: 0, vt: 0, far: false, cam: { z: 1 }, hits: [], overlay: [], player: { x: X + 8, y: Y + 6, dir: 1, moving: false, path: [] }, env: { tariff: false }, api: { ui: { sel: new Set() } }, reduced: () => true, leadBubble() {}, tag() {}, icon() {}, chip() {}, posOf: (e) => [e.x, e.y], truckPos: () => [X, Y], ...o }; return w; };
const env = (o = {}) => ({ t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, hz: 0, lod: lodOf(1.0), ...o });
const lead = (o = {}) => ({ id: 'lead:abc', type: 'lead', zone: 1, x: X, y: Y, seg: 'student', dir: 1, moving: false, leaving: false, look: lookOf('abcstudent'), lead: { id: 'abc', need: false }, ...o });
const strip = (hits) => JSON.stringify(hits.map((h) => ({ ...h, lead: undefined, lot: undefined, asset: undefined })));

// ---------------------------------------------------------------- the clock of a doll
test('hopOf: 0.35 s, 6 world pixels at the top, stretch Y 1.08 at the top; nothing before it begins or after it ends', () => {
  assert.deepEqual(ch.hopOf(1000, -1), { h: 0, sy: 1, sx: 1 }); assert.equal(ch.hopOf(1000, 2000).h, 0); assert.equal(ch.hopOf(1400, 1000).h, 0);
  const top = ch.hopOf(1175, 1000); assert.ok(Math.abs(top.h - 6) < 1e-9 && Math.abs(top.sy - 1.08) < 1e-9 && top.sx < 1);
  for (let t = 1000; t <= 1350; t += 10) { const k = ch.hopOf(t, 1000); assert.ok(k.h >= -1e-9 && k.h <= 6 + 1e-9); }
});
test('squashOf: 0.18 s, Y 0.92 first, a small overshoot, then 1, with the inverse on X; none before or after', () => {
  assert.deepEqual(ch.squashOf(500, -1), { sy: 1, sx: 1 }); assert.equal(ch.squashOf(500, 1000).sy, 1); assert.equal(ch.squashOf(1200, 1000).sy, 1);
  let min = 9, max = 0; for (let t = 1000; t <= 1180; t += 4) { const s = ch.squashOf(t, 1000); min = Math.min(min, s.sy); max = Math.max(max, s.sy); assert.ok(Math.abs(s.sx + s.sy - 2) < 1e-9); }
  assert.ok(min >= 0.92 - 1e-9 && min < 0.97, `min ${min}`); assert.ok(max > 1.0 && max <= 1.06, `overshoot ${max}`);
});
test('blinkOf: 80 ms every 3 to 6 s, and open for ever when time stands still', () => {
  for (const every of [3000, 4500, 6000]) { let shut = 0, n = 0; for (let t = 1; t < 60000; t++) { n++; if (ch.blinkOf(t, every, 0.3)) shut++; } assert.ok(Math.abs(shut / n - 80 / every) < 0.004, `${every}: ${shut / n}`); }
  assert.equal(ch.blinkOf(0, 3000, 0.5), false);
});
test('noticeOf: within 3.5 tiles and 1 at the player\'s side', () => { assert.equal(ch.noticeOf(0, 0), 1); assert.equal(ch.noticeOf(3.5, 0), 0); assert.equal(ch.noticeOf(4, 4), 0); assert.ok(ch.noticeOf(1.75, 0) > 0.49 && ch.noticeOf(1.75, 0) < 0.51); });

// ---------------------------------------------------------------- outfits
test('every buyer of the game has a look and an outfit: the named originals keep theirs, the others wear the family of their strongest tag, and every one is deterministic', () => {
  const segs = Object.keys(cfg.BUYERS); assert.equal(segs.length, 101);
  for (const [seg, o] of Object.entries(ch.NAMED)) assert.ok(segs.includes(seg), `${seg} is a buyer`);
  assert.equal(Object.keys(ch.NAMED).length, 17);
  const heads = new Set(), items = new Set(); let dressed = 0;
  for (const seg of segs) { const r = ch.roleOf(seg, cfg.BUYERS[seg].like), r2 = ch.roleOf(seg, cfg.BUYERS[seg].like); assert.deepEqual(r, r2); if (r.head || r.item || r.torso || r.face) dressed++; if (r.head) heads.add(r.head); if (r.item) items.add(r.item); }
  assert.ok(dressed >= 80, `${dressed} of 101 wear something by role`); assert.ok(heads.size >= 8, `${heads.size} kinds of hat`); assert.ok(items.size >= 8, `${items.size} things held`);
  assert.deepEqual(ch.roleOf('student', {}), { head: 'beanie', item: 'backpack' }); assert.deepEqual(ch.roleOf('nobody', { tool: 1 }), { head: 'hardhat', item: 'wrench' }); assert.deepEqual(ch.roleOf('nobody', {}), {});
  const a = ch.lookV2(lead({ seg: 'barista' })), b = ch.lookV2(lead({ seg: 'barista' })); assert.deepEqual(a, b);
  const shirts = new Set(), hairs = new Set(), skins = new Set(); for (let i = 0; i < 200; i++) { const l = ch.lookV2(lead({ id: 'lead:' + i, lead: { id: 'id' + i }, seg: 'student' })); shirts.add(l.shirt); hairs.add(l.hair); skins.add(l.skin); assert.ok(pal.PEOPLE.shirts.includes(l.shirt) && pal.PEOPLE.hair.includes(l.hair) && pal.PEOPLE.skin.includes(l.skin)); }
  assert.ok(shirts.size >= 10 && hairs.size >= 5 && skins.size >= 5, 'the palette of 2.6 is all in use');
});
test('the player is the one tomato-red doll with a beanie: no buyer wears the player\'s jacket or the player\'s beanie', () => {
  assert.equal(ch.PLAYER.shirt, pal.TOY.red); assert.equal(ch.PLAYER.role.head, 'beanie');
  for (const s of pal.PEOPLE.shirts) assert.notEqual(s.toLowerCase(), pal.TOY.red.toLowerCase());
});

// ---------------------------------------------------------------- the drawers, and the hit shapes they leave
test('lead: the same hit shape and the same labels as the legacy drawer; a doll with a face at the working zoom, a pill when far; one picture twice; nothing thinner than 1.5', () => {
  stack.setFlags('all:legacy'); const e1 = lead(), w1 = mkWorld(); actorMethods.drawLead.call(w1, recCtx().ctx, e1);
  stack.setFlag('lead', 'v2'); const e2 = lead(), w2 = mkWorld(), a = recCtx(); stack.slotFor('lead').draw(a.ctx, null, env(), w2, e2);
  assert.equal(strip(w2.hits), strip(w1.hits)); assert.equal(w2.hits.length, 1); assert.equal(w2.overlay.length, w1.overlay.length); assert.equal(w2.overlay[0].k, 'bub');
  assert.ok(a.log.calls.length > 40, 'a doll is dozens of flat fills'); assert.equal(a.log.depth, 0); assert.equal(a.state.globalAlpha, 1); assert.ok(thinnestStroke(a.log) >= 1.5 - 1e-9);
  const b = recCtx(); stack.slotFor('lead').draw(b.ctx, null, env(), mkWorld(), lead()); assert.deepEqual(a.log.calls, b.log.calls);
  const far = recCtx(); stack.slotFor('lead').draw(far.ctx, null, env({ far: true }), mkWorld({ cam: { z: 0.2 } }), lead()); assert.ok(far.log.calls.length < a.log.calls.length / 4, 'far is a pill');
  const leaving = mkWorld(); stack.slotFor('lead').draw(recCtx().ctx, null, env(), leaving, lead({ leaving: true, leaveAt: -1000 })); assert.equal(leaving.hits.length, 0, 'a buyer who is leaving takes no clicks');
  stack.setFlags('all:legacy');
});
test('lead: eyes open and no hop under reduced motion (t = 0); a buyer who notices the player hops once with the clock running', () => {
  stack.setFlag('lead', 'v2'); const e = lead(), w = mkWorld({ player: { x: X + 1, y: Y + 1, dir: 1, moving: false, path: [] } });
  const still = recCtx(); stack.slotFor('lead').draw(still.ctx, null, env({ t: 0 }), w, e); const t0 = recCtx(); stack.slotFor('lead').draw(t0.ctx, null, env({ t: 50000, wind: 1 }), mkWorld({ player: w.player, t: 50000 }), lead());
  const hopT = e.v2 && e.v2.hopAt; assert.equal(hopT === undefined || hopT < 0, true, 'no hop was started at t = 0');
  const e2 = lead(), w2 = mkWorld({ player: w.player, t: 50000 }); stack.slotFor('lead').draw(recCtx().ctx, null, env({ t: 50000, wind: 1 }), w2, e2); assert.equal(e2.v2.hopAt, 50000, 'the hop begins when the player comes within 3.5 tiles');
  const nextHop = e2.v2.nextHop; assert.ok(nextHop >= 50000 + 20000 && nextHop <= 50000 + 40000, `the next hop is 20 to 40 s later (${nextHop - 50000})`);
  stack.slotFor('lead').draw(recCtx().ctx, null, env({ t: 50100, wind: 1 }), w2, e2); assert.equal(e2.v2.hopAt, 50000, 'staying near does not hop again');
  stack.setFlags('all:legacy');
});
test('player: a soft golden disc under the feet (no ring line), a chip that says You, and a doll with the beanie; nothing thinner than 1.5', () => {
  stack.setFlag('player', 'v2'); const w = mkWorld(), r = recCtx(); stack.slotFor('player').draw(r.ctx, null, env(), w);
  assert.equal(w.overlay.length, 1); assert.equal(w.overlay[0].k, 'chip'); assert.ok(r.log.calls.length > 60); assert.equal(r.log.depth, 0); assert.equal(r.state.globalAlpha, 1); assert.ok(thinnestStroke(r.log) >= 1.5 - 1e-9);
  assert.ok(!r.log.strokes.some((s) => s.style === '#ffd36e'), 'no yellow ring under the feet'); stack.setFlags('all:legacy');
});
test('lot and asset: the same hit polygons as the legacy drawers, a pallet under a lot, a pool under the chosen crate, and the labels', () => {
  const cls = Object.keys(cfg.ASSETS)[0], mkLot = () => ({ id: 'lot:7', type: 'lot', zone: 1, x: X, y: Y, drop: 0, slot: 0, lot: { id: 7, cls, cond: 'sound', price: 12, mode: 'sale' } }), mkAsset = () => ({ id: 'asset:3', type: 'asset', zone: 1, x: X + 1, y: Y, drop: 12, slot: 0, asset: { id: 3, cls, cond: 'sound', wear: 0.9 } });
  stack.setFlags('all:legacy'); const l1 = mkWorld(), a1 = mkWorld(); stockMethods.drawLot.call(l1, recCtx().ctx, mkLot()); stockMethods.drawAsset.call(a1, recCtx().ctx, mkAsset());
  stack.setFlags('lot:v2,asset:v2'); const l2 = mkWorld(), a2 = mkWorld(), r1 = recCtx(), r2 = recCtx(); stack.slotFor('lot').draw(r1.ctx, null, env(), l2, mkLot()); stack.slotFor('asset').draw(r2.ctx, null, env(), a2, mkAsset());
  assert.equal(strip(l2.hits), strip(l1.hits)); assert.equal(strip(a2.hits), strip(a1.hits)); assert.equal(l2.overlay[0].k, 'tag'); assert.equal(a2.overlay[0].k, 'icon');
  const sel = mkWorld(); sel.api.ui.sel.add(3); const r3 = recCtx(); stack.slotFor('asset').draw(r3.ctx, null, env(), sel, mkAsset()); assert.ok(r3.log.calls.length > r2.log.calls.length, 'a chosen crate adds its pool of light'); assert.ok(!r3.log.strokes.some((s) => s.style === '#ffd36e'), 'and no ring line');
  const broken = mkAsset(); broken.asset.cond = 'broken'; const r4 = recCtx(); stack.slotFor('asset').draw(r4.ctx, null, env(), mkWorld(), broken); assert.ok(r4.log.fills.length > 0);
  for (const r of [r1, r2, r3, r4]) { assert.equal(r.log.depth, 0); assert.equal(r.state.globalAlpha, 1); assert.ok(thinnestStroke(r.log) >= 1.5 - 1e-9); }
  stack.setFlags('all:legacy');
});
test('truck and car: the truck leaves the legacy circle and chip; a car fades with the road and draws no hit', () => {
  const f = { id: 'f1', to: 2, items: [{}, {}], arrive: 5 }, e = { id: 'truck:f1', type: 'truck', from: 1, f, dirY: false, hd: 1 };
  stack.setFlags('all:legacy'); const w1 = mkWorld(); actorMethods.drawTruck.call(w1, recCtx().ctx, e);
  stack.setFlags('truck:v2,car:v2'); const w2 = mkWorld(), r = recCtx(); stack.slotFor('truck').draw(r.ctx, null, env(), w2, e);
  assert.equal(strip(w2.hits), strip(w1.hits)); assert.equal(w2.overlay[0].k, 'chip'); assert.equal(r.log.depth, 0); assert.ok(thinnestStroke(r.log) >= 1.5 - 1e-9);
  const c = { gx: X, gy: Y, i: 2, key: 0, horiz: true, fade: 0.5 }, w3 = mkWorld(), r3 = recCtx(); stack.slotFor('car').draw(r3.ctx, null, env(), w3, c); assert.equal(w3.hits.length, 0); assert.ok(r3.log.calls.length > 10); assert.equal(r3.state.globalAlpha, 1);
  stack.setFlags('all:legacy');
});
void iso;
