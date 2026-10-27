// WCAG 2.2 contrast checks computed from the real CSS tokens (both the standard and the high-contrast theme).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const block = (re) => { const m = css.match(re); const o = {}; for (const [, k, v] of (m?.[1] || '').matchAll(/--([\w-]+):\s*([^;]+);/g)) o[k] = v.trim(); return o; };
const base = block(/:root\s*\{([^}]*)\}/);
const high = { ...base, ...block(/:root\[data-contrast="high"\]\s*\{([^}]*)\}/) };

const lum = (hex) => { if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((c) => c + c).join(''); const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => (n >> s) & 255).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const [name, T] of [['standard', base], ['high contrast', high]]) {
  test(`text contrast >= 4.5:1 (${name})`, () => {
    const surfaces = ['bg', 'bg2', 'panel', 'panel2'];
    for (const fg of ['ink', 'mute', 'gold', 'green', 'red', 'cyan', 'violet']) for (const bg of surfaces) assert.ok(ratio(T[fg], T[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(T[fg], T[bg]).toFixed(2)}`);
    for (const [fg, bg] of [['on-gold', 'gold'], ['ink', 'good-bg'], ['ink', 'bad-bg'], ['ink', 'warn-bg'], ['ink', 'info-bg']]) assert.ok(ratio(T[fg], T[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(T[fg], T[bg]).toFixed(2)}`);
    for (const [fg, bg] of [['gold', 'warn-bg'], ['green', 'good-bg'], ['red', 'bad-bg'], ['cyan', 'info-bg']]) assert.ok(ratio(T[fg], T[bg]) >= 4.5, `${fg} accent on ${bg}: ${ratio(T[fg], T[bg]).toFixed(2)}`);
  });
  test(`non-text contrast >= 3:1: focus ring and control boundaries (${name})`, () => {
    assert.ok(ratio(T.focus, T.bg) >= 3 && ratio(T.focus, T.panel) >= 3, 'focus ring');
    for (const bg of ['bg', 'panel', 'panel2']) assert.ok(ratio(T.field, T[bg]) >= 3, `field border on ${bg}: ${ratio(T.field, T[bg]).toFixed(2)}`);
  });
}

test('coloured buttons keep readable text', () => {
  assert.ok(ratio('#04210f', base.green) >= 4.5, 'green button');
  assert.ok(ratio('#2a0503', base.red) >= 4.5, 'danger button');
  assert.ok(ratio('#04202c', base.cyan) >= 4.5, 'cyan badge');
});

test('reduced motion and focus styles exist in the stylesheet', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-motion="reduce"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 2\.4rem/, 'touch targets are at least 24px (WCAG 2.5.8)');
});

test('index.html has language, viewport, skip link, live regions and a main landmark', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const needle of ['<html lang="en"', 'name="viewport"', 'class="skip"', 'aria-live="polite"', 'role="alert"', '<main id="app"']) assert.ok(html.includes(needle), needle);
});

// ---- the Background draft, debrief and instructor screens (css/ui-draft.css)
const draftCss = readFileSync(new URL('../css/ui-draft.css', import.meta.url), 'utf8');
for (const [name, T] of [['standard', base], ['high contrast', high]]) {
  test(`draft cards keep text contrast on every surface they use (${name})`, () => {
    // unselected card: panel2; selected card and filled tray slot: warn-bg; full-hand dashed card and empty slot: bg2; tray: panel; the tick box: bg
    for (const bg of ['panel2', 'warn-bg', 'bg2', 'panel']) for (const fg of ['ink', 'mute', 'green', 'red', 'gold']) assert.ok(ratio(T[fg], T[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(T[fg], T[bg]).toFixed(2)}`);
    assert.ok(ratio(T['on-gold'], T.gold) >= 4.5, 'the tick on the gold box');
    for (const bg of ['panel2', 'warn-bg', 'bg2']) assert.ok(ratio(T.field, T[bg]) >= 3, `tick box border on ${bg}`);
    assert.ok(ratio(T.gold, T.bg) >= 3 && ratio(T.gold, T.panel) >= 3, 'selected card border');
  });
}
test('the draft stylesheet uses only tokens that exist, in both themes', () => {
  const used = new Set([...draftCss.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]));
  for (const t of used) { assert.ok(t in base, `--${t} is not a token of the base theme`); assert.ok(t in high, `--${t} is not a token of the high-contrast theme`); }
  assert.ok(used.size >= 10);
});
test('the draft keeps a visible focus ring and 24px targets (WCAG 2.4.7, 2.5.8)', () => {
  assert.match(draftCss, /\.dr-card:has\(\.dr-in:focus-visible\)\s*\{[^}]*outline: 3px solid var\(--focus\)/);
  assert.match(draftCss, /\.dr-card > \.dr-in\s*\{[^}]*width: 100%[^}]*height: 100%/, 'the whole card is the target');
});
