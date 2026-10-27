// The dashboard's event plumbing: a screen that is mounted again must never answer a click twice.
import test from 'node:test';
import assert from 'node:assert/strict';

function fakeRoot() { const h = {}; return { _h: h, addEventListener(t, fn) { (h[t] ||= []).push(fn); } }; }
const click = (root, act) => { const el = { dataset: { act }, getAttribute: () => null, disabled: false }; for (const f of root._h.click || []) f({ target: { closest: () => el }, preventDefault() {} }); };

test('re-mounting a screen swaps the action table; it never stacks a second listener', async () => {
  const { delegate } = await import('../js/ui/common.js');
  const root = fakeRoot(); let first = 0, second = 0;
  delegate(root, { train() { first++; } });
  delegate(root, { train() { second++; } });   // the same #app, mounted again after Menu > Debrief > Back
  delegate(root, { train() { second++; } });
  assert.equal(root._h.click.length, 1, 'exactly one click listener'); assert.equal(root._h.change.length, 1); assert.equal(root._h.input.length, 1);
  click(root, 'train');
  assert.equal(first, 0, 'the old screen is gone'); assert.equal(second, 1, 'one click runs one action');
  root._acts = {}; click(root, 'train'); assert.equal(second, 1, 'a screen with no actions answers nothing');
});

test('the main entry resets the action table before every screen', async () => {
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /root\._acts = \{\};/);
  const shell = fs.readFileSync(new URL('../js/ui/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /document\.addEventListener\('keydown', keydown\)/); assert.match(shell, /document\.removeEventListener\('keydown', keydown\)/, 'the shell binds its key handler once and removes it on destroy');
});
