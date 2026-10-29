// Shared UI plumbing: DOM helpers, focus-safe rendering, announcements, dialogs, settings, sound and pixel fx.
import { kv } from '../session.js';
import { audio, bindSettings, initAudio, legacySfx, migrateAudio, mirrorFlat, audioSettingsHTML, bindAudioSettings, rememberLinkRule } from '../audio/index.js';
export { fmtMoney as money, fmtPct as pct, fmtX as xfmt } from '../market.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// ---- settings (contrast, motion, text size, sound). Stored locally only. `settings.audio` holds the sound settings (js/audio/settings.js, docs/AUDIO.md 7.1); `sound`, `vol`, `sfxUi`, `sfxGame`
// and `ambient` mirror it, and an older save that only knows `sound` is migrated (a player who turned sound off stays silent). `?sound=off|quiet|full` is read before the first save.
export const settings = Object.assign({ contrast: 'normal', motion: 'auto', size: 'm', sound: true }, kv.get('settings') || {});
const AT = typeof location !== 'undefined' ? location.search : '';
rememberLinkRule(kv, settings, AT); // a room rule the link applies (quiet, or off) is remembered before the first save and before `settings.audio` is replaced, so a student who never joins is given their own sound back
settings.audio = migrateAudio(settings, AT);
mirrorFlat(settings);
bindSettings(settings);
export function applySettings() {
  const r = document.documentElement;
  r.dataset.contrast = settings.contrast; r.dataset.motion = settings.motion; r.dataset.size = settings.size;
  mirrorFlat(settings);
  kv.set('settings', settings);
  audio.sync(settings.audio);
  if (reduced()) fxStop();
}
export const reduced = () => settings.motion === 'reduce' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---- rendering that does not steal focus or clobber typing
export function setHTML(el, html) {
  if (!el) return false;
  if (el._html === html) return false;
  const a = document.activeElement;
  if (a && el.contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]), select, textarea')) return false; // never re-render under a typing user
  const fid = a && el.contains(a) ? a.dataset.fid : null;
  el._html = html;
  const kept = [...el.children].filter((c) => c.hasAttribute('data-keep')); // a layer put inside from outside (the Academy's coach card, in a dialog) is not part of the markup and survives it
  el.innerHTML = html;
  for (const k of kept) el.appendChild(k);
  if (fid) el.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({ preventScroll: true });
  return true;
}

// ---- keeping the cursor in sight
// A repaint that puts the keyboard on a control with `preventScroll` (so the page does not jump under a mouse) can leave that control where nobody sees it: under a sticky foot,
// or above the top edge of a sheet that was scrolled for the screen before. These three work out and make the one scroll that brings it back; they never move the cursor.
/** A focus ring is a 3px line drawn 2px out from its control (css/styles.css, :focus-visible): the room a control needs on every side to be seen with its ring. */
export const RING_REACH = 5;
/**
 * Pure. How far a scrolling sheet must move, in screen pixels (positive: the content goes up), for a control and its ring to lie inside `band`, the part of the sheet that can
 * be seen ({ top, bottom }). Nothing when they already do, so a control the player can see is never moved; the nearest edge otherwise; the control's own top edge when it is
 * taller than the band (its name is at the top). `box` is the control's rect ({ top, bottom }). Anything that is not a number answers 0.
 */
export function scrollDelta(box, band, reach = RING_REACH) {
  if (!box || !band) return 0;
  const top = box.top - reach, bottom = box.bottom + reach;
  if (![top, bottom, band.top, band.bottom].every(Number.isFinite)) return 0;
  if (bottom - top > band.bottom - band.top) return top - band.top;
  if (top < band.top) return top - band.top;
  if (bottom > band.bottom) return bottom - band.bottom;
  return 0;
}
const stickyNow = (e, style) => { const cs = style(e); return cs.position === 'sticky' && cs.display !== 'contents'; };
/**
 * The part of a scrolling sheet `d` that a control can be seen in, in screen pixels: from the sheet's top edge to its foot, or to the top of whatever sticks to the foot (a dock of
 * buttons, a Continue row) when that is not the control itself. `k` is the sheet's scale on the screen (an arriving sheet is drawn a little small), so a distance read from the screen can
 * be turned back into scroll pixels. `sticky` narrows the elements that are looked at (a selector); `style` is getComputedStyle (a test hands in its own).
 */
export function bandOf(d, el, { sticky = '*', style = (e) => getComputedStyle(e) } = {}) {
  const r = d.getBoundingClientRect(), k = d.offsetHeight > 0 && r.height > 0 ? r.height / d.offsetHeight : 1;
  const top = r.top + d.clientTop * k;
  let bottom = top + d.clientHeight * k;
  for (const e of d.querySelectorAll(sticky)) {
    if (e === el || e.contains(el) || !stickyNow(e, style)) continue;
    const q = e.getBoundingClientRect();
    if (q.width > 0 && q.height > 0 && q.top > (top + bottom) / 2 && q.top < bottom) bottom = q.top; // a foot: it hides what lies under it
  }
  return { top, bottom, k };
}
/**
 * Where `el` stands in the screen by its LAYOUT (offsetTop and its kin), as { top, bottom }, or null when that cannot be told. The screen rect of a control that is moving for a moment
 * (a heading that pops in at a scale of .7, a card lifted by a hover) is not where it will stand: measured then, the control is a few pixels off the place it settles in.
 */
function layoutBox(d, el, band) {
  let top = 0, e = el;
  for (; e && e !== d; e = e.offsetParent) { if (!Number.isFinite(e.offsetTop)) return null; top += e.offsetTop; }
  if (e !== d || !Number.isFinite(el.offsetHeight)) return null;
  const t = band.top + (top - d.scrollTop) * band.k;
  return { top: t, bottom: t + el.offsetHeight * band.k };
}
/**
 * Scrolls the sheet `d` just far enough that `el` and its ring are in the band (see bandOf, scrollDelta), and returns how far it went (0: nothing moved). The box it keeps in sight is
 * the larger of where the control is drawn now and where its layout puts it, so a control caught half way through an animation is still kept in sight where it will stand. It sets
 * scrollTop, which is instant (no stylesheet here asks for smooth scrolling), so reduced motion has nothing to switch off, and it never calls focus(). A control on the sticky foot
 * itself is always in sight and is left alone, and so is one that has no box (hidden).
 */
export function keepInView(d, el, opts = {}) {
  if (!d || !el || el === d || !d.contains?.(el)) return 0;
  const style = opts.style || ((e) => getComputedStyle(e));
  for (let e = el; e && e !== d; e = e.parentElement) if (stickyNow(e, style)) return 0;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return 0;
  const band = bandOf(d, el, { sticky: opts.sticky, style }), lay = layoutBox(d, el, band);
  const box = lay ? { top: Math.min(rect.top, lay.top), bottom: Math.max(rect.bottom, lay.bottom) } : rect, delta = scrollDelta(box, band, opts.reach);
  if (!delta) return 0;
  const before = d.scrollTop;
  d.scrollTop = before + delta / band.k;
  return d.scrollTop - before;
}

// ---- announcements and toasts
export function announce(msg, assertive = false) {
  const el = $(assertive ? '#alert-live' : '#live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
  // An open modal dialog makes the rest of the page inert, and an inert live region is not in the accessibility tree (Chrome: "activeModalDialog"), so what is said while the Deal Room or the
  // settings are open must be said inside them. The region is made on first use, kept across the sheet's redraws (setHTML keeps `data-keep`) and written the same way: cleared, then the words.
  const d = $('#dlg');
  if (d && d.open) {
    const kind = assertive ? 'alert' : 'status';
    let r = [...d.children].find((c) => c.dataset && c.dataset.say === kind);
    if (!r) { r = document.createElement('div'); r.className = 'sr'; r.dataset.say = kind; r.setAttribute('data-keep', ''); r.setAttribute('role', kind); r.setAttribute('aria-live', assertive ? 'assertive' : 'polite'); r.setAttribute('aria-atomic', 'true'); d.appendChild(r); }
    r.textContent = '';
    setTimeout(() => { r.textContent = msg; }, 30);
  }
}
export function toast(msg, level = 'info', ms = 4200, o = {}) { // o.refusal: the toast answers an action the engine refused (say(r)); the sound layer plays its "no" for those and for no other bad toast. o.own: its sound is requested by the code that raised it (a reward: the resolver may keep it quiet), so the toast's fallback "ok" stays out
  const box = $('#toasts');
  if (box) {
    const t = document.createElement('div');
    t.className = 'toast ' + level;
    if (o && o.refusal) t.dataset.refusal = '1';
    if (o && o.own) t.dataset.snd = 'own';
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, ms); // fade, then go: a toast never just vanishes
  }
  announce(msg, level === 'bad');
}

// ---- dialogs (native <dialog>: focus trap, Escape, inert background for free)
const D = () => $('#dlg');
let returnFocus = null;
/**
 * A bar that sticks to an edge of a scrolling box (a dialog's foot, a drawer's selection bar or Ship row, the draft's actions bar) stands over whatever the keyboard scrolls to that edge:
 * Tab scrolls a control only as far as the box's scroll-padding says, and a bar that is not in the padding is not there for it. Such a bar carries data-stuck="top" or "bottom".
 * `fitStuck(box)` writes how far the bars on each edge reach into `box` as --stuck-t and --stuck-b (px; the deepest bar on an edge; 0 when there is none), and css turns them into the
 * box's scroll-padding (styles.css: the page and dialogs; shell.css: the drawers), so a control scrolled to is left clear of the bar, its 5px ring and all. A bar's reach is how far its
 * far edge stands from the box's edge once it is stuck: the box's padding on that side (a sticky offset is taken inside it), plus the bar's own offset (negative when it bleeds back
 * into the padding), plus its height. That is a measure the markup cannot give, since a bar wraps, so it is read from the page. `style` is getComputedStyle (a test hands in its own).
 * A bar that leaves no room beside it has nothing to scroll a control into, and no padding can make some: when it would stand over more than FREE of the box (the Ship row on a phone: 150px
 * of a 200px drawer), or when the tallest control in the box would not fit in what it leaves (a manager card of 253px beside an 83px foot in a 340px dialog, with half a rem each side for the
 * ring), it gets data-free, which css/styles.css turns into position: static, so it scrolls with the content instead of covering it.
 */
export const FREE = 0.4, SLACK = 16;
export const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'; // the Tab stops: never the page's own region or a heading (tabindex -1), which is as tall as the whole page
export function stuckReach(box, style = (e) => getComputedStyle(e)) {
  const reach = { top: 0, bottom: 0 }, bs = box?.querySelectorAll ? style(box) : null;
  if (!bs) return reach;
  let tall = null; // the tallest control that is not on a bar, looked for only when a bar is there to be fitted around
  for (const bar of box.querySelectorAll('[data-stuck]')) {
    const edge = bar.dataset.stuck === 'top' ? 'top' : 'bottom', h = bar.offsetHeight;
    if (!(h > 0)) continue; // hidden: it stands over nothing
    if (tall === null) tall = [...box.querySelectorAll(FOCUSABLE)].reduce((m, e) => (e.closest?.('[data-stuck]') ? m : Math.max(m, e.offsetHeight || 0)), 0);
    const free = h > box.clientHeight * FREE || tall + h + SLACK > box.clientHeight; // measured whether it is stuck or not: its height does not change when it lets go, so it cannot flip back and forth
    if (free !== bar.hasAttribute('data-free')) bar.toggleAttribute('data-free', free);
    if (free) continue;
    const at = style(bar), pad = parseFloat(bs[edge === 'top' ? 'paddingTop' : 'paddingBottom']) || 0, off = parseFloat(at[edge]) || 0;
    reach[edge] = Math.max(reach[edge], Math.max(0, pad + off + h));
  }
  return reach;
}
export function fitStuck(box, style) {
  if (!box?.style) return null;
  const r = stuckReach(box, style), t = Math.round(r.top) + 'px', b = Math.round(r.bottom) + 'px';
  if (box.style.getPropertyValue('--stuck-t') !== t) box.style.setProperty('--stuck-t', t); // written only when it changed: a drawer is looked at after every redraw
  if (box.style.getPropertyValue('--stuck-b') !== b) box.style.setProperty('--stuck-b', b);
  return r;
}
export const dlg = {
  open(html, { cls = '', label = '', onClose } = {}) {
    const d = D();
    if (d.open) d.close();
    returnFocus = document.activeElement;
    d.className = cls;
    d.setAttribute('aria-label', label || 'Dialog');
    d.innerHTML = html;
    d._onClose = onClose;
    d.showModal();
    d.scrollTop = 0; // the element is reused: a tall dialog must not open half way down
    fitStuck(d); // measured once it is on the screen (a closed dialog has no boxes); a dialog that repaints its foot says so with dlg.fit(), and a resize is heard in initDialog
    (d.querySelector('[autofocus]') || d.querySelector('h1,h2,h3') || d).focus?.();
    return d;
  },
  close() { const d = D(); if (d.open) d.close(); },
  /** The open dialog's foot changed (its text came or went, a button was added): measure it again. */
  fit() { const d = D(); return d.open ? fitStuck(d) : null; },
  get el() { return D(); },
};
export function initDialog() {
  const d = D();
  // The dialog is where the cursor lives, never a stop on the way. Chrome gives every scrolling element a Tab stop of its own, and a scrolling dialog is one: a stop that does
  // nothing, whose ring (3px, 2px out) lies outside the screen when the dialog fills it (the Deal Room on a phone, a laptop at 200%). tabindex -1 takes it out of the Tab order
  // and keeps it focusable by script (`dlg.open` falls back to it), and every control inside is still reached by Tab, which scrolls it into view; arrow keys and Page Down scroll
  // the dialog from any of them. Escape and the focus handed back on close are untouched.
  d.tabIndex = -1;
  // When it closes the dialog is finished with: its class goes (a class that sets `display`, such as the Deal Room's, would keep a closed sheet drawn below the page, with its controls in
  // the Tab order and the accessibility tree), and the cursor goes back to what opened it. That control is sometimes gone by then (a bought lot or a sold crate redrew the drawer it
  // stood in): the cursor then goes to the open drawer's title, else to the game itself, never to a control of the closed sheet. The `d.open` checks are for a dialog that was opened
  // again at once: `open` closes the one on screen first, and that close event is heard after the new content is already in.
  d.addEventListener('close', () => {
    d._onClose?.(); d._onClose = null;
    if (!d.open) d.className = '';
    try { returnFocus?.focus({ preventScroll: true }); } catch { /* element gone */ }
    setTimeout(() => {
      if (typeof document === 'undefined') return;
      const a = document.activeElement;
      if (d.open || (a && a !== document.body && a !== document.documentElement && a !== d && a.isConnected && !d.contains(a))) return; // it is somewhere real already
      try { (document.querySelector('#drawer:not([hidden]) #dh-title') || document.getElementById('app'))?.focus({ preventScroll: true }); } catch { /* nothing to focus */ }
    }, 0);
  });
  // A click on the dialog's own backdrop closes it, and only a PRESS that began there counts. A press on a control that ends on the dialog itself (the finger went down on a button and a
  // card laid over the dialog moved under it, or it slid off the button) makes a click whose target is the nearest common ancestor, the dialog, and that is not a click on the backdrop:
  // it used to close the hire dialog under the player's finger. `down` is where the last press began (null: a click made by script, which has no press and still closes).
  let down = null;
  const begin = (e) => { down = e.target; };
  d.addEventListener('pointerdown', begin, true); d.addEventListener('mousedown', begin, true);
  d.addEventListener('click', (e) => { const began = down; down = null; if (e.target === d && (began === null || began === d)) d.close(); });
  globalThis.addEventListener?.('resize', () => { if (d.open) fitStuck(d); }); // a narrower window wraps a foot onto more lines; a turned phone is a resize too
  initAudio({ settings, save: applySettings, announce, toast, kv }); // the page-wide sound layer: the unlock, key M, the control table, the dialog and toast observers
}

// ---- delegated actions: <button data-act="name" data-x="..."> -> acts.name(el, event)
export function delegate(root, acts) {
  root._acts = acts;                       // re-mounting a screen swaps the table, it never stacks a second listener
  if (root._delegated) return;
  root._delegated = true;
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = root._acts?.[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    const fn = el && root._acts?.[el.dataset.change];
    if (fn) fn(el, e);
  });
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    const fn = el && root._acts?.[el.dataset.input];
    if (fn) fn(el, e);
  });
}

// ---- sound (synthesised in the browser: no audio files to ship). The five legacy names are thin aliases over the engine in js/audio (docs/AUDIO.md 8.4): no-ops once the wiring is installed.
export const sfx = legacySfx;

// ---- pixel burst on a full-screen canvas
// One pooled particle array (nothing is allocated after the first burst), one rAF loop that sleeps the moment nothing is alive, physics by elapsed time (a 120 Hz screen
// is not twice as fast as a 60 Hz one), and a canvas that owns pixels only while particles fly: left standing, a full-screen canvas holds tens of megabytes at 1440p.
// Same call as ever: burst({ x, y, color, n, power }); nothing happens in reduced motion.
const FX = { c: null, g: null, pool: [], live: 0, raf: 0, t: 0, w: 0, h: 0, cols: [], watching: false, seen: false };
const FX_MAX = 480, FX_TAIL = 14; // pool size; frames over which a dying particle fades
const fxCol = (c) => { let i = FX.cols.indexOf(c); if (i < 0) { if (FX.cols.length >= 8) FX.cols.length = 3; i = FX.cols.push(c) - 1; } return i; };
function fxFit() { // the canvas is the window's size in CSS pixels, backed by up to 2x device pixels, and drawn in CSS pixels
  const c = FX.c, dpr = Math.min(2, window.devicePixelRatio || 1);
  FX.w = innerWidth; FX.h = innerHeight;
  c.hidden = false; c.width = Math.round(FX.w * dpr); c.height = Math.round(FX.h * dpr);
  FX.g = c.getContext('2d'); FX.g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function fxStop() {
  if (FX.raf) cancelAnimationFrame(FX.raf);
  FX.raf = 0; FX.live = 0;
  if (FX.c) { FX.c.width = FX.c.height = 0; FX.c.hidden = true; } // give the backing store back
  if (FX.watching) { removeEventListener('resize', fxFit); FX.watching = false; }
}
function fxFrame(now) {
  const { g, pool } = FX, k = Math.min(3, Math.max(0.1, (now - FX.t) / 16.667 || 1)); // frames elapsed, capped so a returning tab does not jump
  FX.t = now;
  for (let i = 0; i < FX.live;) {
    const p = pool[i]; p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.35 * k; p.life -= k;
    if (p.life <= 0 || p.y > FX.h + 24) { pool[i] = pool[--FX.live]; pool[FX.live] = p; } else i++; // swap-remove: the dead one goes back to the pool
  }
  g.clearRect(0, 0, FX.w, FX.h);
  for (let ci = 0; ci < FX.cols.length; ci++) { // one fillStyle per colour, solid particles first
    g.fillStyle = FX.cols[ci];
    for (let i = 0; i < FX.live; i++) { const p = pool[i]; if (p.c === ci && p.life >= FX_TAIL) g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  }
  for (let i = 0; i < FX.live; i++) { const p = pool[i]; if (p.life < FX_TAIL) { g.globalAlpha = p.life / FX_TAIL; g.fillStyle = FX.cols[p.c]; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } }
  g.globalAlpha = 1;
  FX.raf = FX.live ? requestAnimationFrame(fxFrame) : 0;
  if (!FX.live) fxStop();
}
export function burst({ x, y, color = '#46e38e', n = 90, power = 1 } = {}) {
  if (reduced()) return;
  FX.c ||= $('#fx'); if (!FX.c) return;
  if (!FX.watching) { FX.watching = true; addEventListener('resize', fxFit); }
  if (FX.c.hidden) fxFit(); // idle: the canvas has no pixels; give it some for as long as the burst lasts
  if (!FX.seen) { FX.seen = true; document.addEventListener('visibilitychange', () => { if (document.hidden) fxStop(); }); } // a hidden tab's burst is over when it returns
  x ??= innerWidth / 2; y ??= innerHeight / 2.4;
  const cols = [fxCol(color), fxCol('#ffc247'), fxCol('#ffffff')];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (2 + Math.random() * 7) * power;
    const p = FX.live < FX.pool.length ? FX.pool[FX.live++] : FX.pool.length < FX_MAX ? (FX.pool.push({}), FX.pool[FX.live++]) : FX.pool[(Math.random() * FX.live) | 0]; // reuse, grow to the cap, then recycle a live one
    p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 3; p.life = 40 + Math.random() * 40; p.s = 4 + Math.floor(Math.random() * 3) * 2; p.c = cols[i % 3];
  }
  if (!FX.raf) { FX.t = performance.now(); FX.raf = requestAnimationFrame(fxFrame); }
}

export function settingsDialog(onChange) {
  const d = dlg.open(`
    <button class="btn ghost sm x" data-close>Close</button>
    <h2 tabindex="-1" autofocus>Display and sound</h2>
    <p class="mute small">This game targets WCAG 2.2 AA. Everything works with a keyboard: Tab to move, Enter or Space to press, Escape to close windows.</p>
    <div class="grid g2">
      <div><label for="s-contrast">Contrast</label><select id="s-contrast" data-k="contrast"><option value="normal">Standard dark</option><option value="high">High contrast</option></select></div>
      <div><label for="s-motion">Motion</label><select id="s-motion" data-k="motion"><option value="auto">Follow my system</option><option value="reduce">Reduce motion</option></select></div>
      <div><label for="s-size">Text size</label><select id="s-size" data-k="size"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option><option value="xl">Extra large</option></select></div>
    </div>
    ${audioSettingsHTML(settings.audio, audio.state)}
    <p class="small mute gap">Settings are stored only in this browser. No account, no personal data.</p>`, { label: 'Settings' });
  for (const sel of d.querySelectorAll('select[data-k]')) {
    const k = sel.dataset.k;
    sel.value = settings[k];
    sel.onchange = () => { settings[k] = sel.value; applySettings(); onChange?.(); };
  }
  bindAudioSettings(d, { audio, settings, save: () => { applySettings(); onChange?.(); }, announce });
  d.querySelector('[data-close]').onclick = () => dlg.close();
}
