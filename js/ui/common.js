// Shared UI plumbing: DOM helpers, focus-safe rendering, announcements, dialogs, settings, sound and pixel fx.
import { kv } from '../session.js';
export { fmtMoney as money, fmtPct as pct, fmtX as xfmt } from '../market.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// ---- settings (contrast, motion, text size, sound). Stored locally only.
export const settings = Object.assign({ contrast: 'normal', motion: 'auto', size: 'm', sound: true }, kv.get('settings') || {});
export function applySettings() {
  const r = document.documentElement;
  r.dataset.contrast = settings.contrast; r.dataset.motion = settings.motion; r.dataset.size = settings.size;
  kv.set('settings', settings);
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
  el.innerHTML = html;
  if (fid) el.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({ preventScroll: true });
  return true;
}

// ---- announcements and toasts
export function announce(msg, assertive = false) {
  const el = $(assertive ? '#alert-live' : '#live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
}
export function toast(msg, level = 'info', ms = 4200) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + level;
  t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), ms);
  announce(msg, level === 'bad');
}

// ---- dialogs (native <dialog>: focus trap, Escape, inert background for free)
const D = () => $('#dlg');
let returnFocus = null;
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
    (d.querySelector('[autofocus]') || d.querySelector('h1,h2,h3') || d).focus?.();
    return d;
  },
  close() { const d = D(); if (d.open) d.close(); },
  get el() { return D(); },
};
export function initDialog() {
  const d = D();
  d.addEventListener('close', () => { d._onClose?.(); d._onClose = null; try { returnFocus?.focus({ preventScroll: true }); } catch { /* element gone */ } });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
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

// ---- sound (synthesised: no audio files to ship)
let ac;
function tone(freq, t0, dur, type = 'square', gain = 0.05) {
  if (!settings.sound) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.03);
  } catch { /* audio unavailable */ }
}
export const sfx = {
  kaching() { tone(1318, 0, 0.09); tone(1760, 0.09, 0.4); tone(2349, 0.09, 0.3, 'triangle', 0.03); },
  buzz() { tone(110, 0, 0.28, 'sawtooth', 0.07); },
  level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.2)); },
  blip() { tone(880, 0, 0.05, 'square', 0.03); },
  alarm() { tone(440, 0, 0.15, 'sawtooth', 0.06); tone(330, 0.18, 0.25, 'sawtooth', 0.06); },
};

// ---- pixel burst on a full-screen canvas
let parts = [], raf = 0;
export function burst({ x, y, color = '#46e38e', n = 90, power = 1 } = {}) {
  if (reduced()) return;
  const c = $('#fx'), g = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  x ??= innerWidth / 2; y ??= innerHeight / 2.4;
  const cols = [color, '#ffc247', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (2 + Math.random() * 7) * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 40 + Math.random() * 40, s: 4 + Math.floor(Math.random() * 3) * 2, c: cols[i % 3] });
  }
  clearTimeout(burst._t); burst._t = setTimeout(() => { parts = []; raf = 0; g.clearRect(0, 0, c.width, c.height); }, 2600);
  if (raf) return;
  const loop = () => {
    g.clearRect(0, 0, c.width, c.height);
    parts = parts.filter((p) => p.life-- > 0);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.35; g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
    raf = parts.length ? requestAnimationFrame(loop) : 0;
    if (!parts.length) g.clearRect(0, 0, c.width, c.height);
  };
  raf = requestAnimationFrame(loop);
}

export function settingsDialog(onChange) {
  const d = dlg.open(`
    <button class="btn ghost sm x" data-close>Close</button>
    <h2 tabindex="-1" autofocus>Accessibility and sound</h2>
    <p class="mute small">This game targets WCAG 2.2 AA. Everything works with a keyboard: Tab to move, Enter or Space to press, Escape to close windows.</p>
    <div class="grid g2">
      <div><label for="s-contrast">Contrast</label><select id="s-contrast" data-k="contrast"><option value="normal">Standard dark</option><option value="high">High contrast</option></select></div>
      <div><label for="s-motion">Motion</label><select id="s-motion" data-k="motion"><option value="auto">Follow my system</option><option value="reduce">Reduce motion</option></select></div>
      <div><label for="s-size">Text size</label><select id="s-size" data-k="size"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option><option value="xl">Extra large</option></select></div>
      <div><label for="s-sound">Sound effects</label><select id="s-sound" data-k="sound"><option value="1">On</option><option value="0">Off</option></select></div>
    </div>
    <p class="small mute gap">Settings are stored only in this browser. No account, no personal data.</p>`, { label: 'Settings' });
  for (const sel of d.querySelectorAll('select[data-k]')) {
    const k = sel.dataset.k;
    sel.value = k === 'sound' ? (settings.sound ? '1' : '0') : settings[k];
    sel.onchange = () => { settings[k] = k === 'sound' ? sel.value === '1' : sel.value; applySettings(); onChange?.(); };
  }
  d.querySelector('[data-close]').onclick = () => dlg.close();
}
