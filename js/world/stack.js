// The layer stack: the one place that says what the world draws, in what order, in which space, and who owns each piece. See docs/RENDER_PLAN.md.
// Owner: T5 RASTER QUALITY (the engine). The tracks never edit this file; they register their layers from their own modules (registerLayer) and flip a flag.
//
// A layer is a drawer with one signature, draw(ctx, view, env, w, a):
//   ctx   the 2D context it paints on (the canvas, or the ground cache's own surface)
//   view  the world-pixel rectangle on screen {x0, x1, y0, y1} (a margin wider than the window, so big things are not cut)
//   env   the world's presentation record (w.env): t (visual clock, 0 when motion is reduced), night, wind, dim, far, lite, lod (lodOf(zoom)), lights (push to light the night)
//   w     the World (state: cam, unlocked, fxOf(zone), reduced(), ents, player, ...). Layers read it; none writes game state
//   a     the layer's subject when it has one (a prop, an entity, the set of districts in view, the ground pass record)
// and a space, which says what transform the engine has set when the layer is called:
//   'screen'   device pixels / dpr: css pixels of the window (the grade, labels, weather)
//   'world'    the camera transform: world pixels (sx, sy of a grid point), which pan and zoom with the island
//   'inherit'  whatever the caller has set (a ground layer is called by the ground pass under the world transform of the canvas or of the ground cache; an item by the depth loop)
// Every layer has a LEGACY drawer (the code the world has always run, now living in its owner's module) and may have a V2 drawer. A flag chooses (setFlag, or `?layers=sea:v2,clouds:v2`
// in the address while developing); every flag is 'legacy' at the start of the art work, so the picture is exactly the old one until a track flips its own. A V2 drawer replaces the
// legacy one whole: it draws what the legacy drawer drew and the same hit shapes, in the new look. When a track's flags are all 'v2' and its tests pin the new look, the legacy drawer is deleted.

/**
 * id        the key every call site, flag and registration uses
 * owner     the track that owns the legacy and the V2 drawer (T1 terrain, coast and water; T2 atmosphere; T3 buildings; T4 props, nature and characters; T5 engine and raster)
 * space     the space of the LEGACY drawer (a V2 drawer says its own when it registers)
 * stage     where it sits in the frame: 'sea', 'ground' (inside the ground cache when the camera is still), 'things' (the depth-sorted list), 'air' (over the things, in the world) or 'screen'
 * legacy    adapter from the layer signature to the method the World has always had
 */
export const LAYERS = [
  { id: 'sea', owner: 'T1', space: 'screen', stage: 'sea', legacy: (ctx, view, env, w) => w.drawWater(ctx) },
  { id: 'shore', owner: 'T1', space: 'inherit', stage: 'ground', legacy: (ctx, view, env, w, a) => w.drawCliffs(ctx, view, a.far, a.see) },
  { id: 'terrain', owner: 'T1', space: 'inherit', stage: 'ground', legacy: (ctx, view, env, w, a) => w.drawTerrain(ctx, view, a.zoom) },
  { id: 'roads', owner: 'T1', space: 'inherit', stage: 'ground', legacy: (ctx, view, env, w, a) => w.drawRoads(ctx, view, a.far, a.see) },
  { id: 'blocks', owner: 'T1', space: 'inherit', stage: 'ground', legacy: (ctx, view, env, w, a) => w.drawBlocks(ctx, view, a.zoom, a.mode, a.see) },
  { id: 'livedecals', owner: 'T1', space: 'inherit', stage: 'ground', legacy: (ctx, view, env, w) => w.drawLiveDecals(ctx, view) },
  { id: 'static', owner: 'T5', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, p) => w.drawStatic(ctx, p) }, // the bridge to the prop tables (props.js: T3 buildings, T4 the rest)
  { id: 'plot', owner: 'T3', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawPlot(ctx, e) },
  { id: 'pipe', owner: 'T3', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawPipe(ctx, e) },
  { id: 'lead', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawLead(ctx, e) },
  { id: 'lot', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawLot(ctx, e) },
  { id: 'asset', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawAsset(ctx, e) },
  { id: 'truck', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, e) => w.drawTruck(ctx, e) },
  { id: 'car', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w, c) => w.drawCar(ctx, c) },
  { id: 'player', owner: 'T4', space: 'inherit', stage: 'things', legacy: (ctx, view, env, w) => w.drawPlayer(ctx) },
  { id: 'clouds', owner: 'T2', space: 'world', stage: 'air', legacy: (ctx, view, env, w, vz) => w.drawFog(ctx, vz) },
  { id: 'grade', owner: 'T2', space: 'screen', stage: 'screen', legacy: (ctx, view, env, w) => w.drawGrade(ctx) },
  { id: 'weather', owner: 'T2', space: 'screen', stage: 'screen', legacy: (ctx, view, env, w) => w.drawWeather(ctx) },
  { id: 'field', owner: 'T2', space: 'screen', stage: 'screen', legacy: (ctx, view, env, w) => w.drawField(ctx) },
  { id: 'particles', owner: 'T2', space: 'screen', stage: 'screen', legacy: (ctx, view, env, w) => w.drawParticles(ctx) },
];

export const IMPLS = ['legacy', 'v2'];
const BY_ID = new Map(), SLOT = Object.create(null), V2 = new Map(), GROUND_IDS = LAYERS.filter((l) => l.stage === 'ground' && l.id !== 'livedecals').map((l) => l.id);
export const FLAGS = Object.create(null);
const slotOf = (L, impl, draw, space) => ({ id: L.id, impl, space, draw });
for (const L of LAYERS) { BY_ID.set(L.id, L); FLAGS[L.id] = 'legacy'; SLOT[L.id] = slotOf(L, 'legacy', L.legacy, L.space); }

const settle = (id) => { const L = BY_ID.get(id), v = V2.get(id); SLOT[id] = FLAGS[id] === 'v2' && v ? slotOf(L, 'v2', v.draw, v.space) : slotOf(L, 'legacy', L.legacy, L.space); };

/**
 * Register a layer's V2 drawer (called by the owner's module when it loads). It is used only while the layer's flag is 'v2'. `space` is the space the V2 drawer wants (the engine sets it).
 * A GROUND layer (stage 'ground') also gives `key(w)`: a number that changes whenever the layer's picture for a still camera changes (a palette step, an opened gate); the ground cache
 * is drawn again when the combined key (groundKey) moves. A layer whose still picture depends on nothing but the camera and the unlocked districts gives no key.
 */
export function registerLayer(id, draw, space = 'world', key) {
  if (!BY_ID.has(id)) throw new Error(`no layer called ${id}`);
  if (typeof draw !== 'function') throw new TypeError('a layer drawer is a function (ctx, view, env, w, a)');
  if (space !== 'screen' && space !== 'world' && space !== 'inherit') throw new RangeError('a layer space is screen, world or inherit');
  if (key !== undefined && typeof key !== 'function') throw new TypeError('a layer key is a function (w) => number');
  V2.set(id, { draw, space, key }); settle(id);
}
/** The ground cache's invalidation key from the V2 ground layers in force (0 while they are all legacy): the keys of the layers that give one, folded into one integer. */
export function groundKey(w) {
  let k = 0;
  for (const id of GROUND_IDS) { const s = SLOT[id]; if (s.impl === 'v2') { const f = V2.get(id).key; if (f) k = (Math.imul(k, 31) + (Math.round(f(w)) | 0)) | 0; } }
  return k;
}
/** Choose the drawer of a layer: 'legacy' (the code the world has always run) or 'v2' (the registered one; a layer with none stays legacy). Answers the implementation now in force. */
export function setFlag(id, impl) {
  if (!BY_ID.has(id)) throw new Error(`no layer called ${id}`);
  if (!IMPLS.includes(impl)) throw new RangeError('a flag is legacy or v2');
  FLAGS[id] = impl; settle(id); return SLOT[id].impl;
}
/** Set flags from a string such as "sea:v2,clouds:v2" or "all:legacy" (the `?layers=` address); unknown ids are skipped, and the ones set are answered. */
export function setFlags(spec) {
  const done = [];
  for (const part of String(spec || '').split(',')) {
    const [id, impl] = part.split(':').map((s) => s.trim());
    if (!impl) continue;
    for (const k of id === 'all' ? [...BY_ID.keys()] : BY_ID.has(id) ? [id] : []) { try { setFlag(k, impl); done.push(k); } catch { /* a bad flag is ignored */ } }
  }
  return done;
}
/** The drawer in force for a layer: { id, impl, space, draw }, or undefined for an id that is not a layer. */
export const slotFor = (id) => SLOT[id];
export const layerInfo = (id) => BY_ID.get(id);

/**
 * Draw one layer. The engine's spaces are set first when the layer wants them; an id that is not a layer draws nothing (an entity of a kind the world does not know).
 * `a` is the layer's subject. Errors are not caught here: the caller wraps what must never blank the frame (World.safeLayer, the item loop).
 */
export function runLayer(id, w, ctx, view, a) {
  const s = SLOT[id]; if (s === undefined) return;
  if (s.space === 'screen') w.toScreen(ctx); else if (s.space === 'world') w.toWorld(ctx);
  s.draw(ctx, view, w.env, w, a);
}

// `?layers=` while developing: a page opened with ?layers=sea:v2 draws that layer's V2 drawer, if the build has one.
try { if (typeof location !== 'undefined' && location.search) { const q = new URLSearchParams(location.search).get('layers'); if (q) setFlags(q); } } catch { /* no address to read */ }
