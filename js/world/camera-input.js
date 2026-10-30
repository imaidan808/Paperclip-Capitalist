// How the world's zoom is asked for: a mouse wheel, a trackpad's two-finger scroll, a trackpad pinch, and Safari's gesture events, all turned into one zoom about a point.
// Pure: nothing here touches the page. The world gives this module a few functions (`host`) and the event objects it already holds, and gets numbers back.
//
// What each browser sends, and what is done with it (the browsers disagree, so the source of a wheel event is worked out from the event, never from the browser's name):
//   - a mouse wheel notch: Firefox sends deltaMode 1 (lines); Chrome and Edge send deltaMode 0 with a whole, large deltaY (100, or 120 on some Windows displays) and no deltaX;
//     on a Mac they send a small deltaY that is a whole multiple of MAC_TICK (4.000244...: the number a Mac wheel click is made of, never a whole number itself).
//     One notch is one clear step (MOUSE_STEP), and the zoom eases in over a fraction of a second, so a notch reads as a move and not as a jump.
//   - a trackpad pinch: Chrome, Edge and Firefox send a wheel event with ctrlKey set and a small, fractional deltaY. It is followed 1:1 (PINCH_RATE) and applied at once:
//     easing a thing the fingers are already moving would only make the map trail them.
//   - a two-finger trackpad scroll: plain wheel events with small deltaY (often fractional), at the screen's rate, then macOS momentum: a tail of ever smaller deltas.
//     It zooms smoothly in proportion (TRACKPAD_RATE) and is applied at once. One gesture (one run of events with no pause) has a budget (TRACKPAD_BUDGET): the gain tapers as it is
//     spent, so a hard flick and its momentum end softly after a few times the zoom and never fling the camera across the whole range; the range takes a few deliberate strokes.
//     A camera glide of the world's own (Fit, Show me) wins over a scroll: the scroll's events, and the rest of that gesture's momentum, are let go. A pinch or a notch still takes over.
//   - Safari sends none of that for a pinch: it sends gesturestart, gesturechange (a scale since the start of the gesture) and gestureend, with the point between the fingers.
// No single event can move the zoom by more than MAX_EVENT_FACTOR, so a burst, a momentum tail or a broken device cannot throw the camera; the zoom range itself is the world's.
// A trackpad flick can carry whole numbers over 50 (macOS locks the scroll to one axis, so deltaX is 0), which look like a mouse notch on their own. So the ZoomInput also remembers
// when the last scroll or pinch event came, and a notch-sized event inside the same gesture (within STREAM_GAP_MS) is read as part of it; a notch after a pause is a notch.
// The same run of events is the gesture the budget and the glide rule above are kept for.
// Every function here takes whatever it is given: a missing field, NaN or Infinity is no movement (a factor of 1) and never an error.

export const LINE_PX = 16;             // a line of a wheel that scrolls by lines, in pixels
export const DEFAULT_PAGE_PX = 800;    // the height of a "page" of wheel when the caller does not say
export const NOTCH_MIN_PX = 50;        // a whole-number deltaY of at least this, with no deltaX, is a mouse wheel's notch (a trackpad's deltas are small or fractional)
export const NOTCH_PX = 120;           // a notch event counts as its delta over this many notches, never fewer than one (even a small one is a whole step) and at most MAX_NOTCHES
export const MAX_NOTCHES = 3;          // a fast-spun wheel's biggest event counts as this many notches
export const MAC_TICK = 4.000244140625; // what a click of a Mac's wheel is made of: its deltaY is a whole multiple of this (a trackpad's whole numbers are not, so they stay a scroll)
export const MAC_TICK_TOL = 1e-4;      // how far from a multiple of MAC_TICK a deltaY may be and still be one
export const MOUSE_STEP = 1.16;        // the zoom of one notch
export const TRACKPAD_RATE = 0.001;    // natural-log zoom per pixel of a two-finger scroll: a gentle slide of 150 px is one notch's worth (1.16 times), 800 px is 2.2 times before the gesture's budget tapers it
export const TRACKPAD_BUDGET = Math.log(4); // the natural-log zoom a two-finger gesture spends while its gain falls from all to the floor: a vigorous flick of 2000 px with its momentum gives about 3 times (untapered, 7), an enormous one about 6
export const GAIN_FLOOR = 0.15;        // the least gain a scroll has left once its gesture's budget is spent (it never stops dead, so a long slow scroll still goes on)
export const PINCH_RATE = 0.01;        // natural-log zoom per unit of a pinch's deltaY: a pinch follows the fingers
export const MAX_EVENT_FACTOR = 1.6;   // the most one event may zoom by, either way
export const ZOOM_TAU = 0.09;          // seconds: the easing's time constant. 86% of a notch is done in 180 ms, and the last of it is snapped at SETTLE_LN
export const SETTLE_LN = 0.005;        // an ease this close (in natural-log zoom, about half a percent) to where it is going lands on it
export const STREAM_GAP_MS = 100;      // a scroll or pinch event this soon after the last one is the same gesture (a trackpad sends one every 8 to 33 ms, and a busy frame can hold one back for 50)

export const MOUSE = 'mouse', PINCH = 'pinch', TRACKPAD = 'trackpad';

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const finOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const between = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A zoom factor kept to what one event may do: 1 for anything that is not a positive number, else within 1/max to max. */
export function clampFactor(f, max = MAX_EVENT_FACTOR) {
  if (typeof f !== 'number' || !Number.isFinite(f) || f <= 0) return 1;
  const m = Number.isFinite(max) && max > 1 ? max : MAX_EVENT_FACTOR;
  return between(f, 1 / m, m);
}

/** Is this deltaY a click of a Mac's wheel? A whole multiple of MAC_TICK (never a whole number: a trackpad's integers are not one), with no sideways movement. */
export function isMacTick(rawX, rawY) {
  if (rawX !== 0 || !Number.isFinite(rawY) || Number.isInteger(rawY)) return false;
  const a = Math.abs(rawY), k = Math.round(a / MAC_TICK);
  return k >= 1 && Math.abs(a - k * MAC_TICK) <= MAC_TICK_TOL;
}

/**
 * A wheel event as one pixel-equivalent delta and the kind of device that sent it. `delta` is deltaY in pixels (a line is LINE_PX, a page is `pageHeight`); it is negative when the
 * wheel turned up or the fingers moved to scroll up. `source` is MOUSE, PINCH or TRACKPAD: a notch is a mouse whatever else is set (a mouse wheel with Ctrl held is still a notch),
 * else ctrlKey says a pinch, else it is a scroll. `guess` is true when a notch was recognised by the size of its delta alone (by line or by page the device is certain).
 * One exception to "by line is a notch": a physical notch is a whole number of lines, so a fractional number of lines with Ctrl held is a pinch some browser sends by line.
 */
export function normalizeWheel(e, pageHeight = DEFAULT_PAGE_PX) {
  const mode = fin(e?.deltaMode), page = pageHeight > 0 && Number.isFinite(pageHeight) ? pageHeight : DEFAULT_PAGE_PX;
  const rawY = fin(e?.deltaY), rawX = fin(e?.deltaX);
  const byLine = mode === 1, byPage = mode === 2;
  const delta = rawY * (byLine ? LINE_PX : byPage ? page : 1);
  const bySize = !byLine && !byPage && rawX === 0 && ((Number.isInteger(rawY) && Math.abs(rawY) >= NOTCH_MIN_PX) || isMacTick(rawX, rawY));
  const lineSent = (byLine || byPage) && !!e?.ctrlKey && !Number.isInteger(rawY);
  const source = lineSent ? PINCH : byLine || byPage || bySize ? MOUSE : e?.ctrlKey ? PINCH : TRACKPAD;
  return { delta, source, guess: bySize };
}

/** What a pixel delta from one kind of device does to the zoom, as a factor (above 1 zooms in; wheel up, fingers up and a pinch outwards all do). Within MAX_EVENT_FACTOR; 1 for no movement. */
export function zoomFactor(delta, source) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || !delta) return 1;
  const limit = Math.log(MAX_EVENT_FACTOR);
  let ln;
  if (source === MOUSE) ln = (delta < 0 ? 1 : -1) * between(Math.abs(delta) / NOTCH_PX, 1, MAX_NOTCHES) * Math.log(MOUSE_STEP);
  else ln = -delta * (source === PINCH ? PINCH_RATE : TRACKPAD_RATE);
  return clampFactor(Math.exp(between(ln, -limit, limit)));
}

/** How much of a two-finger scroll's zoom is left to give once a gesture has spent `used` (natural-log zoom, always above 0) of its TRACKPAD_BUDGET: 1 at the start, tapering to GAIN_FLOOR. */
export function trackpadGain(used) {
  const u = typeof used === 'number' && used > 0 ? used : 0; // NaN and anything not a number have spent nothing; an infinite spend has spent it all
  return between(1 - u / TRACKPAD_BUDGET, GAIN_FLOOR, 1);
}

/** What one wheel event does to the zoom on its own (see zoomFactor). */
export function wheelZoomFactor(e, pageHeight = DEFAULT_PAGE_PX) {
  const { delta, source } = normalizeWheel(e, pageHeight);
  return zoomFactor(delta, source);
}

/** Safari's gesturechange gives the scale since the gesture began; the zoom to apply now is how much that scale has grown since the last event. */
export function gestureZoomFactor(prevScale, scale) {
  if (typeof prevScale !== 'number' || typeof scale !== 'number' || !Number.isFinite(prevScale) || !Number.isFinite(scale) || prevScale <= 0 || scale <= 0) return 1;
  return clampFactor(scale / prevScale);
}

/**
 * One step of the zoom easing, in the zoom's own natural log (so a step in and a step out feel alike): the next zoom, `dt` seconds later, on the way from `current` to `target`.
 * An exponential approach with time constant `tau`, independent of the frame rate; within SETTLE_LN of the target it lands on it. No time passed is no movement; a zoom that is not a
 * positive number is replaced by the target (and a target that is not one leaves the zoom where it is).
 */
export function easeZoom(current, target, dt, tau = ZOOM_TAU) {
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!ok(target)) return ok(current) ? current : 1;
  if (!ok(current)) return target;
  if (!(dt > 0) || !Number.isFinite(dt)) return current;
  if (!(tau > 0)) return target;
  const gap = Math.log(target / current);
  if (Math.abs(gap) <= SETTLE_LN) return target;
  return current * Math.exp(gap * (1 - Math.exp(-dt / tau)));
}

/**
 * The zoom input of one world. `host` is what the world lends it:
 *   zoom()              the zoom now
 *   apply(z, px, py)    set the zoom to z, keeping the world point under screen point (px, py) where it is (the world's own clamps still apply)
 *   range()             [lowest, highest] zoom
 *   size()              [width, height] of the canvas in CSS pixels
 *   instant()           true when nothing may ease: reduced motion, or no loop to drive the ease
 *   touching()          (optional) true while two or more fingers are on the canvas: Safari's gesture events then repeat what pointer events already did (iOS sends both)
 *   gliding()           (optional) true while the camera is on a glide of the world's own (Fit, Show me, a district change): a two-finger scroll, and the momentum behind it, lets it be
 * A mouse notch sets a goal, and `tick(dt)` (called by the world's loop while `pending`) moves the zoom towards it about the pointer; every other kind of zoom is applied at once and
 * ends any ease in progress, so two inputs never fight over the camera.
 */
export class ZoomInput {
  constructor(host) { this.host = host; this.goal = null; this.gest = null; this.stream = null; this.last = null; this.mouse = false; }

  /** Is an ease on its way? (The world keeps its loop awake while this is true.) */
  get pending() { return this.goal !== null; }
  /** Stop easing and stay where the zoom is now. */
  cancel() { this.goal = null; }
  /** Stop easing and say where the ease was going, or null when none was: a step taken now (a button, a key) goes on from the notch's end, not from wherever the ease had got to. */
  settle() { const g = this.goal; this.goal = null; return g ? g.z : null; }
  canEase() { let off = true; try { off = !!this.host.instant(); } catch { /* a host that cannot say is a host that cannot ease */ } return !off; }
  gliding() { try { return !!(this.host.gliding && this.host.gliding()); } catch { return false; } }

  /** Where on the canvas a point is, in CSS pixels; the middle of the canvas when it is not a number. */
  center() { const [w, h] = this.host.size(); return [finOr(w, 0) / 2, finOr(h, 0) / 2]; }
  at(x, y) { const [cx, cy] = this.center(); return [finOr(x, cx), finOr(y, cy)]; }

  /**
   * A wheel event over the canvas. Returns whether it moved or began to move the zoom.
   * Events that follow one another within STREAM_GAP_MS are one gesture (`stream`), which carries what it has spent of its budget and whether it was let go for a glide.
   */
  wheel(e) {
    const [, h] = this.host.size(), n = normalizeWheel(e, h), at = finOr(e?.timeStamp, NaN), prev = this.stream;
    const cont = !!prev && at - prev.at >= 0 && at - prev.at <= STREAM_GAP_MS; // the same gesture as the last event
    let source = n.source;
    if (source === MOUSE && n.guess && cont) source = e?.ctrlKey ? PINCH : TRACKPAD; // a big event inside a trackpad's gesture
    this.stream = source === MOUSE ? null : Number.isFinite(at) ? { at, used: cont ? prev.used : 0, held: cont && prev.held } : null;
    const [px, py] = this.at(e?.offsetX, e?.offsetY);
    if (Number.isFinite(e?.offsetX) && Number.isFinite(e?.offsetY)) this.seen(px, py); // a wheel is turned over a pointer: that is where the pointer is
    let f = zoomFactor(n.delta, source);
    if (f === 1) return false;
    if (source === TRACKPAD) {
      const gliding = this.gliding();
      if (gliding && this.stream) this.stream.held = true; // the camera is gliding: this gesture, momentum and all, is let go
      if (gliding || this.stream?.held) return false;
      f = this.spend(f);
    }
    if (source === MOUSE && this.canEase()) return this.ease(f, px, py);
    this.cancel();
    this.host.apply(this.host.zoom() * f, px, py);
    return true;
  }

  /** A two-finger scroll's factor, less what its gesture has already spent: the gain tapers as the budget goes (trackpadGain), and what is given is spent. */
  spend(f) {
    const s = this.stream; if (!s) return f;
    const ln = Math.log(f) * trackpadGain(s.used);
    s.used += Math.abs(ln);
    return Math.exp(ln);
  }

  /** A mouse notch: the goal moves on from the goal already set (so a quick run of notches adds up), clamped to the range. */
  ease(f, px, py) {
    const [lo, hi] = this.host.range(), base = this.goal ? this.goal.z : this.host.zoom();
    const z = Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? between(base * f, lo, hi) : base * f;
    this.goal = { z, px, py };
    return true;
  }

  /** The world's loop calls this each frame with the seconds since the last. Returns whether the zoom was moved. */
  tick(dt) {
    const g = this.goal, h = this.host;
    if (!g) return false;
    if (!this.canEase()) { this.goal = null; h.apply(g.z, g.px, g.py); return true; } // motion was turned down, or the loop stopped, with an ease on its way: arrive now
    if (!(dt > 0)) return false;
    const cur = h.zoom(), next = easeZoom(cur, g.z, dt);
    h.apply(next, g.px, g.py);
    const got = h.zoom();
    if (next === g.z || !(Math.abs(Math.log(got / next)) < 1e-9)) this.goal = null; // arrived, or the camera's own clamp held it short of the goal
    return true;
  }

  // ---- Safari: gesturestart / gesturechange / gestureend. `rect` is the canvas's bounding box, so a client point becomes a canvas point.
  /**
   * The pointer is over the canvas at this point (the world tells us on every move, and a wheel is turned over it): where a gesture goes when its own point is missing or is not on the
   * canvas, and where the world looks again for what is under a pointer that has not moved while the ground did. `mouse` is false for a finger, which has no hover.
   */
  seen(px, py, mouse = true) { if (Number.isFinite(px) && Number.isFinite(py)) { this.last = [px, py]; this.mouse = mouse !== false; } }
  /** The pointer left the canvas. */
  left() { this.mouse = false; }
  /** Where a mouse rests over the canvas, or null when it is not there (it left, or the last pointer was a finger). */
  resting() { return this.mouse && this.last ? this.last : null; }
  /**
   * The canvas point of a gesture event: its client point less the canvas's corner. A point that is missing, or not on the canvas (Safari has been seen to report 0,0), is no point:
   * the gesture then keeps its last one, else the pointer's, else the middle of the canvas. Exactly 0,0 is no point even when the canvas stands at the window's corner, where it
   * would pass for the canvas's own: a gesture is never about the corner because a browser gave it none.
   */
  local(e, rect, was) {
    const cx = finOr(e?.clientX, NaN), cy = finOr(e?.clientY, NaN), x = cx - finOr(rect?.left, 0), y = cy - finOr(rect?.top, 0);
    const w = finOr(rect?.width, Infinity), h = finOr(rect?.height, Infinity);
    const given = Number.isFinite(x) && Number.isFinite(y) && !(cx === 0 && cy === 0);
    return given && x >= 0 && y >= 0 && x <= w && y <= h ? [x, y] : was || this.last || this.center();
  }
  gestureStart(e, rect) {
    this.cancel();
    const [px, py] = this.local(e, rect);
    this.gest = { scale: 1, px, py, skip: !!(this.host.touching && this.host.touching()) }; // fingers on the glass: pointer events are zooming already
  }
  gestureChange(e, rect) {
    const g = this.gest || (this.gest = { scale: 1, ...this.pointOf(e, rect), skip: !!(this.host.touching && this.host.touching()) });
    if (g.skip) return false;
    const f = gestureZoomFactor(g.scale, e?.scale);
    if (typeof e?.scale === 'number' && Number.isFinite(e.scale) && e.scale > 0) g.scale = e.scale;
    [g.px, g.py] = this.local(e, rect, [g.px, g.py]);
    if (f === 1) return false;
    this.cancel();
    this.host.apply(this.host.zoom() * f, g.px, g.py);
    return true;
  }
  gestureEnd() { this.gest = null; }
  pointOf(e, rect) { const [px, py] = this.local(e, rect); return { px, py }; }
}
