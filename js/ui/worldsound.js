// What the world says to the sound layer (docs/AUDIO.md 4.3 "World", 4.4). The World (js/world/world.js) reports through the api it is given (hover, activate); this file turns those
// reports into the shell's `ui` events ({ ui: 'hover' | 'locked' | 'step' }, which js/audio/wire.js maps to sounds) and into the few sounds that are played where they are known:
//   hover(h, ev)   the pointer RESTS on a different thing for 120 ms (never on a touch, never while a sheet is open, never while the camera is dragged, never within 250 ms of a click,
//                  at most three a second): one tick, panned to the thing. One timer exists only while the pointer is on a thing it has not yet rested on.
//   clicked(h)     a click on a buyer or a lot is a tick (the Deal Room's own sound follows), on a truck a lighter one, on one of your crates the crate's knock climbing with how many are ticked.
//   locked(h)      a shut gate, plot, board, bank or audit office was clicked: "no", from the outcome of activate, never from the click.
//   poll()         called with each render: while the player walks, one step every 0.36 to 0.42 s, at most eight in a row for one walk, none in Calm or under a sheet. A timer exists only during a walk.
//   camera         the wheel with Ctrl, Meta or Alt and the keys + - 0 reach `World.zoomBy` and `World.fit` and nothing else; both are wrapped on the instance (not in js/world/), once per 150 ms,
//                  silent for a pinch and for a camera button (whose click the control table has already heard).
//   rectOf(k, id)  where a thing is on the SCREEN, in window coordinates, for stereo pan: kinds the World knows, plus 'thing' (a hit as "kind|id") and 'player'.
// The sound is never the only cue: every one of these has a tooltip, a toast, a moving character or a camera that moves.
import { audio } from '../audio/index.js';
import { P } from '../world/iso.js';
import { zAt } from '../world/layout.js';

export const REST_MS = 120, HOVER_GAP = 330, CLICK_QUIET = 250, CAM_GAP = 150, STEP_MS = 390, STEP_JITTER = 30, STEPS_MAX = 8; // a step every 360 to 420 ms: the engine's own cooldown for a footstep is 360, so none of them is thrown away
const ownKind = (k) => ['lead', 'lot', 'asset', 'pipe', 'plot', 'static', 'zone', 'truck'].includes(k);

/**
 * ctx: the drawer context ({ emit, dlg }). deps: { world() (the World or null), now(), random(), player: audio (an object with play) }.
 */
export function createWorldSound(ctx, deps = {}) {
  const world = deps.world || (() => null), now = deps.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now())), random = deps.random || Math.random;
  const out = deps.audio || audio;
  let dead = false, hoverKey = null, hoverT = null, lastHover = -Infinity, lastClick = -Infinity, lastCam = -Infinity, lastButton = -Infinity;
  let stepT = null, steps = 0, idle = 0, camWrapped = null;
  const sheetOpen = () => !!ctx.dlg?.el?.open;
  const keyOf = (h) => `${h.kind}|${h.id}`;

  // ---- where things are on the screen
  function rectOf(kind, id) {
    const w = world(); if (!w || typeof w.rectOf !== 'function') return null;
    let r = null;
    try {
      if (kind === 'thing') { const s = String(id), i = s.indexOf('|'); r = i > 0 && ownKind(s.slice(0, i)) ? w.rectOf(s.slice(0, i), s.slice(i + 1)) : null; }
      else if (kind === 'player') { const pl = w.player; if (pl && typeof w.w2s === 'function') { const [x, y] = w.w2s(...P(pl.x, pl.y, zAt(pl.x, pl.y))); r = { x: x - 1, y: y - 1, w: 2, h: 2 }; } }
      else if (ownKind(kind)) r = w.rectOf(kind, id);
    } catch { r = null; }
    if (!r) return null;
    const c = w.cv?.getBoundingClientRect?.(); // the World answers in canvas pixels; the pan is across the window
    return c ? { x: r.x + c.left, y: r.y + c.top, w: r.w, h: r.h } : r;
  }

  // ---- hover
  function rested(key) {
    const t = now(), w = world();
    if (dead || t - lastHover < HOVER_GAP || t - lastClick < CLICK_QUIET || sheetOpen() || w?.drag?.moved) return;
    lastHover = t;
    ctx.emit({ type: 'ui', ui: 'hover', id: key });
  }
  function hover(h, ev) {
    const key = h ? keyOf(h) : null, touch = !!(ev && ev.pointerType && ev.pointerType !== 'mouse');
    if (key === hoverKey) return;
    hoverKey = key;
    if (hoverT != null) { clearTimeout(hoverT); hoverT = null; }
    if (!key || touch || dead) return;
    hoverT = setTimeout(() => { hoverT = null; if (hoverKey === key) rested(key); }, REST_MS);
  }

  // ---- clicks
  const crate = (n) => out.play('ui.crate', n > 0 ? { variant: 'pick1', params: { n: Math.min(8, n) } } : { variant: 'clear' });
  function clicked(h, o = {}) {
    lastClick = now();
    if (dead || !h) return;
    if (h.kind === 'lead' || h.kind === 'lot') out.play('ui.tick', { variant: 'full', pan: pan(h) });
    else if (h.kind === 'truck') out.play('ui.tick', { variant: 'light', pan: pan(h) });
    else if (h.kind === 'asset' && o.ticked != null) crate(o.ticked);
  }
  const pan = (h) => { const r = rectOf('thing', keyOf(h)); return r ? panOf(r) : undefined; };
  function panOf(r) { const W = (typeof innerWidth === 'number' && innerWidth) || 1; return Math.max(-0.6, Math.min(0.6, ((r.x + r.w / 2 - W / 2) / (W / 2)) * 0.6)); }
  function locked(h) { lastClick = now(); if (!dead && h) ctx.emit({ type: 'ui', ui: 'locked', id: keyOf(h) }); }
  /** A click on the ground: the player walks, so the footsteps may begin. */
  function ground() { lastClick = now(); poll(); }

  // ---- footsteps
  function stepIn() { return Math.max(365, STEP_MS + (random() * 2 - 1) * STEP_JITTER); }
  const walking = () => { const pl = world()?.player; return !!pl && (pl.moving || (pl.path && pl.path.length > 0)); };
  /** One footstep, if the player is walking where it can be seen and heard: not in Calm (the character jumps), not under a sheet, not past the eighth of a walk, not off screen. */
  function step() {
    const w = world(), pl = w?.player;
    if (dead || !pl || steps >= STEPS_MAX || sheetOpen() || (typeof w.reduced === 'function' && w.reduced())) return;
    // `World.view` exists once the world has drawn a frame; a sandbox whose player is already walking (Academy lessons 6, 7 and 9) polls before that, and `onView` read `view.x0` of nothing and threw into render()
    if (!w.view) return;
    try { if (typeof w.onView === 'function' && !w.onView(pl.x, pl.y, 30)) return; } catch { return; } // sound must never throw into the page's render
    steps++; ctx.emit({ type: 'ui', ui: 'step' });
  }
  function tick() {
    stepT = null;
    if (dead) return;
    if (!walking()) { if (++idle <= 3) stepT = setTimeout(tick, 100); else steps = 0; return; } // a walk that has not begun yet gets three looks; a walk that is over resets the count
    idle = 0; step();
    stepT = setTimeout(tick, stepIn());
  }
  /** Called with every render and every click on the ground: if the player has somewhere to go and no walk is being listened to, the first foot lands now and the rest follow. */
  function poll() {
    try {
      if (dead || stepT != null || !walking()) return;
      steps = 0; idle = 0; step();
      stepT = setTimeout(tick, stepIn());
    } catch { /* the footsteps are an addition: a fault here must not reach render() */ }
  }

  // ---- the camera
  function camera(w) {
    if (!w || camWrapped === w || typeof w.zoomBy !== 'function' || typeof w.fit !== 'function') return;
    camWrapped = w;
    const zoomBy = w.zoomBy.bind(w), fit = w.fit.bind(w);
    const heard = (variant) => { const t = now(); if (dead || t - lastCam < CAM_GAP || t - lastButton < CAM_GAP) return; lastCam = t; out.play('cam', { variant }); };
    w.zoomBy = (f, px, py) => { if (!(w.pointers && w.pointers.size > 1) && Number.isFinite(f) && f !== 1) heard(f > 1 ? 'in' : 'out'); return zoomBy(f, px, py); };
    w.fit = (animate = true) => { if (animate) heard('fit'); return fit(animate); };
  }
  /** A camera button was pressed: the control table has played it, so the wrapped camera stays quiet for a moment. */
  const button = () => { lastButton = now(); };

  return {
    rectOf, hover, clicked, locked, ground, poll, camera, button, crate, panOf,
    destroy() { dead = true; if (hoverT != null) clearTimeout(hoverT); if (stepT != null) clearTimeout(stepT); hoverT = stepT = null; },
  };
}
