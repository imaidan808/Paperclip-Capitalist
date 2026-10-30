// A tap is a press and a release on the same button, and the click is made of the two. A panel that is drawn again between them puts a new button where the old one was: the release lands on a button
// the press never touched, and the click goes to neither. Found in the Academy's Bank lesson (844x390): the player slides the amount, which keeps the drawer from being redrawn (common.js, setHTML never
// draws under a typing user), and presses Borrow, which moves the keyboard off the slider; the sandbox's tick, 230 ms apart, then draws the drawer at once with every change it was held back from,
// 22 ms into the press. The tap did nothing in three runs of six, on a slow runner more often.
// A panel is not redrawn while a press that began inside it is down; it is drawn when the press is over (after its click) or, if the release never comes, after 2.5 s.
//   P1  the rule (common.js, watchPress and setHTML) against a fake page
//   P2  the shell watches presses for as long as it is mounted, and lets go of them with it
// The real thing, a tap held across several of the shell's redraws, is in tests/repair-card.test.mjs ("a press held while the clock redraws the drawer").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), read = (f) => readFileSync(join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A page that keeps its listeners, and a panel that keeps what was written into it. */
function fakePage() {
  const on = {}, doc = { activeElement: null, addEventListener(t, f) { (on[t] ||= []).push(f); }, removeEventListener(t, f) { on[t] = (on[t] || []).filter((x) => x !== f); } };
  const win = { addEventListener: doc.addEventListener, removeEventListener: doc.removeEventListener };
  const fire = (t, target) => { for (const f of [...(on[t] || [])]) f({ type: t, target }); };
  const button = {}, outside = {};
  const panel = { _html: '', children: [], written: null, contains: (n) => n === button || n === panel, appendChild() {}, querySelector: () => null };
  Object.defineProperty(panel, 'innerHTML', { set(v) { this.written = v; }, get() { return this.written; } });
  return { doc, win, on, fire, button, outside, panel };
}

test('P1: a panel that asks for it is not redrawn while a press that began inside it is down, and is drawn when the press is over', async () => {
  const { setHTML, watchPress } = await import('../js/ui/common.js');
  const pg = fakePage(); globalThis.document = pg.doc; let ended = 0; const HOLD = { press: true };
  const stop = watchPress(pg.doc, pg.win, () => { ended++; });
  try {
    assert.equal(setHTML(pg.panel, '<b>1</b>', HOLD), true, 'no press: drawn');
    pg.fire('pointerdown', pg.button);
    assert.equal(setHTML(pg.panel, '<b>2</b>', HOLD), false, 'a press inside the panel is down: not drawn');
    assert.equal(pg.panel.written, '<b>1</b>'); assert.equal(pg.panel._html, '<b>1</b>', 'and nothing of it is kept as drawn, so the next draw writes it');
    assert.equal(setHTML(pg.panel, '<b>1</b>', HOLD), false, 'the same markup is still no change');
    assert.equal(setHTML(pg.panel, '<b>2</b>'), true, 'a caller that does not ask (the Deal Room, the instructor\'s pages: nothing draws them again when the press is over) is drawn as before'); pg.panel._html = '<b>1</b>'; pg.panel.written = '<b>1</b>';
    pg.fire('pointerup', pg.button); assert.equal(ended, 0, 'the end of a press is told after the click, which comes in the same task as the release, and not in it');
    await sleep(15); assert.equal(ended, 1, 'then, once');
    assert.equal(setHTML(pg.panel, '<b>2</b>', HOLD), true, 'the press is over: drawn'); assert.equal(pg.panel.written, '<b>2</b>');
    pg.fire('pointerup', pg.button); await sleep(15); assert.equal(ended, 1, 'a release with no press before it tells nothing');

    pg.fire('pointerdown', pg.outside);
    assert.equal(setHTML(pg.panel, '<b>3</b>', HOLD), true, 'a press that began outside the panel (the world, another panel) does not hold it');
    pg.fire('pointerup', pg.outside); await sleep(15);

    pg.fire('pointerdown', pg.button); assert.equal(setHTML(pg.panel, '<b>4</b>', HOLD), false);
    pg.fire('pointercancel', pg.button); await sleep(15); assert.equal(ended, 3, 'a press that the browser takes over (a scroll begins) is over too');
    assert.equal(setHTML(pg.panel, '<b>4</b>', HOLD), true);

    pg.fire('pointerdown', pg.button); assert.equal(setHTML(pg.panel, '<b>5</b>', HOLD), false);
    pg.fire('blur', null); await sleep(15); assert.equal(setHTML(pg.panel, '<b>5</b>', HOLD), true, 'a window that loses the page ends the press');
  } finally { stop(); delete globalThis.document; }
});

test('P1: a press whose release never came does not freeze the panel for ever, and watching stops when it is told to', async () => {
  const { setHTML, watchPress } = await import('../js/ui/common.js');
  const pg = fakePage(); globalThis.document = pg.doc; const HOLD = { press: true }, realNow = Date.now; let t = 1_000_000; Date.now = () => t;
  const stop = watchPress(pg.doc, pg.win, () => {});
  try {
    pg.fire('pointerdown', pg.button); assert.equal(setHTML(pg.panel, '<i>a</i>', HOLD), false);
    t += 2400; assert.equal(setHTML(pg.panel, '<i>a</i>', HOLD), false, 'still a press at 2.4 s');
    t += 200; assert.equal(setHTML(pg.panel, '<i>a</i>', HOLD), true, 'at 2.6 s a release that has not come is not coming: the panel is drawn');
    stop(); assert.deepEqual(Object.values(pg.on).flat(), [], 'every listener is taken off the page');
    pg.fire('pointerdown', pg.button); assert.equal(setHTML(pg.panel, '<i>b</i>', HOLD), true, 'and after that a press holds nothing');
  } finally { Date.now = realNow; stop(); delete globalThis.document; }
});

test('P2: the shell watches presses while it is mounted and redraws when one ends, and lets go of the page with itself', () => {
  const shell = read('js/ui/shell.js'), common = read('js/ui/common.js');
  assert.match(shell, /import \{[^}]*\bwatchPress\b[^}]*\} from '\.\/common\.js'/, 'the shell uses the press watch of common.js');
  assert.match(shell, /const HOLD = \{ press: true \}, unwatchPress = watchPress\(document, window, \(\) => \{ if \(!dead\) render\(\); \}\)/, 'a press that ends redraws what was held back (the clock may be stopped: no tick would come)');
  for (const call of ['setHTML(el.hud, hudHTML(ctx), HOLD)', 'setHTML(el.tracker, trackerHTML(ctx), HOLD)', 'setHTML(el.ticker, tickerHTML(ctx), HOLD)', 'setHTML(el.dock, dockHTML(), HOLD)', 'setHTML(el.drawer, html, HOLD)']) assert.ok(shell.includes(call), `the shell's panels ask to be held under a press: ${call}`);
  assert.match(shell, /function destroy\(\) \{\s*dead = true; off\(\); unwatchPress\(\);/, 'and the page is let go with the shell');
  assert.match(common, /if \(press && pressedIn\(el\)\) return false;/, 'setHTML draws nothing under a press for a caller that asks');
});
