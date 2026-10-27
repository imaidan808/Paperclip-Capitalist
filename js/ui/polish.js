// Presentation-only helpers for the panels and screens: nothing here reads or writes game state.
//
// countUp(root, opts): numbers that tick up to their value, for the moments that deserve it (a deal's result, a lesson's reward).
//   A number opts in with data-count="<final value>" and data-fmt="money|int|pct" (and data-pre / data-post for the words around it, such as "+" and " XP"); its text already holds the final, formatted number, so a page without
//   this call (a test, a print, a screen reader that reads before the tick ends) is always right. Under reduced motion nothing happens at all.
//   It never touches an element that has left the page, and it ends on exactly the text the markup carried, never on a rounded cousin of it.
import { fmtMoney, fmtPct } from '../market.js';

const FMT = { money: (x) => fmtMoney(x), int: (x) => String(Math.round(x)), pct: (x) => fmtPct(x) };
const ease = (t) => 1 - (1 - t) ** 3;

/** Starts every [data-count] under `root`. Returns how many it started. `reduced` is the caller's own test (ctx.reduced). */
export function countUp(root, { reduced = false, ms = 700, delay = 250 } = {}) {
  if (reduced || !root || typeof root.querySelectorAll !== 'function' || typeof requestAnimationFrame !== 'function') return 0;
  let n = 0;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = Number(el.dataset.count), base = FMT[el.dataset.fmt], pre = el.dataset.pre || '', post = el.dataset.post || '', fmt = base && ((x) => pre + base(x) + post);
    if (!Number.isFinite(to) || !fmt) continue;
    const final = el.textContent, t0 = performance.now() + delay;
    el.textContent = fmt(0);
    n++;
    const tick = () => {
      if (!el.isConnected) return;                       // the sheet was drawn again: that copy of the number is gone
      const t = Math.min(1, Math.max(0, (performance.now() - t0) / ms));
      if (t >= 1) { el.textContent = final; return; }
      el.textContent = fmt(to * ease(t));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return n;
}
