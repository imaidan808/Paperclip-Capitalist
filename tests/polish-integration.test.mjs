// Holds the seams between the polish branches: places where one author's sheet depends on a number another author's sheet owns.
// (Presentation only; reads the stylesheets as text, so it needs no browser.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = (f) => readFileSync(new URL(`../css/${f}`, import.meta.url), 'utf8');
const rule = (src, selector) => {
  const at = src.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `${selector} has a rule`);
  return src.slice(at, src.indexOf('}', at));
};

test('the drawer body publishes its padding as --db-pad and pads itself with it', () => {
  const db = rule(css('shell.css'), '.db');
  assert.match(db, /--db-pad:\s*var\(--sp-3\)/);
  assert.match(db, /padding:\s*var\(--db-pad\)/);
});

test('the panels’ sticky bars bleed out by --db-pad, never by a number of their own', () => {
  // A bar that bleeds by a literal .8rem against a .75rem body overhangs the drawer by a pixel and makes the list scroll sideways.
  for (const [file, sel] of [['ui-quests.css', '.qs-nav'], ['ui-travel.css', '.tv-shiprow']]) {
    const r = rule(css(file), sel);
    assert.match(r, /var\(--db-pad, \.8rem\)/, `${sel} reads --db-pad`);
    assert.doesNotMatch(r.replace(/var\(--db-pad, \.8rem\)/g, ''), /-\.8rem/, `${sel} has no literal -.8rem left`);
  }
});
