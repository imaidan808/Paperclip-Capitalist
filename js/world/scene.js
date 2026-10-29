// The scene the ground is baked from: the smooth coast of the island, its distance fields, and the terrain colour field for the set of districts that are still locked. Built once, on first use, and kept.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Pure data over LAYOUT: no drawing here. `warm()` builds it in an idle moment so the first frame that needs it does not wait.
import { LAYOUT, GW, GH, DIST } from './layout.js';
import { buildCoast } from './coastgeo.js';
import { terrainField } from './terrainfield.js';
import { makeScene } from './rasterbase.js';

let COAST = null;
const SCENES = new Map();
/** The smooth coast of the island (rings in grid units, the fine and coarse signed distance fields, `dist(gx, gy)`): made once, about 130 ms. */
export function coastOf() { if (!COAST) COAST = buildCoast({ land: LAYOUT.land, FV: LAYOUT.FV, GW, GH }); return COAST; }
/** The ids of the districts under cloud, from the world's set of open ones (a world that does not know yet has every district open, as the engine does). */
export const lockedOf = (unlocked) => (unlocked ? LAYOUT.ids.filter((id) => !unlocked.has(id)) : []);
/** Everything a bake reads for one set of locked districts (the terrain's colours depend on which are under cloud): the last two sets are kept. */
export function sceneOf(locked = []) {
  const key = locked.join(',');
  let s = SCENES.get(key);
  if (!s) {
    const coast = coastOf(), terr = terrainField({ ZV: LAYOUT.ZV, VW: LAYOUT.VW, GW, GH, land: LAYOUT.land, ids: LAYOUT.ids, DIST }, coast, new Set(locked));
    s = makeScene(coast, terr, LAYOUT.bounds, LAYOUT.ZV, LAYOUT.VW, GW, GH);
    if (SCENES.size >= 2) SCENES.delete(SCENES.keys().next().value);
    SCENES.set(key, s);
  }
  return s;
}
/** Build the coast (and the scene of the opening state) when the browser is idle, so the first draw that needs them finds them made. */
export function warm(locked) { const go = () => { try { sceneOf(locked); } catch { /* the first draw builds it and reports */ } }; if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2000 }); else if (typeof setTimeout === 'function') setTimeout(go, 50); }
/** Forget what was built (for tests, and for a world that gives its memory back). */
export function forget() { COAST = null; SCENES.clear(); }
// A browser builds the coast and the opening state's scene when it is idle (every district but the first under cloud), so the first frame that needs them finds them made; Node has no idle callback and builds on demand.
if (typeof requestIdleCallback === 'function') warm(LAYOUT.ids.filter((id) => id !== 1));
