// The rule that keeps the Academy's coach card off everything a player can press, and the matrix sweep that proves it (scripts/academy-sweep.mjs). This is the pure half, no browser:
//   - the judge: every kind of fault the sweep reports, on measurements written by hand, and that a clean card and a folded card are clean;
//   - the rule's pure parts: freeSpots (an exact search: a clear place is found if one exists), placeCard (it uses it), chooseSize (a card is shown clear of every control or it is the tab, and every size shows the words),
//     fitCard (the tab in the strip hides nothing), smallWindow;
//   - the source: the shapes that dropped the step's words are gone from the script and the sheet, the strip is reserved, the placer asks the page for every control and the selector it asks with is a superset
//     of the one the sweep judges by.
// The browser half is tests/academy-matrix.test.mjs. Run: node --test tests/academy-sweep.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };

const A = await import('../js/ui/academy-sandbox.js');
const SW = await import('../scripts/academy-sweep.mjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const types = (m) => SW.judge(m).map((f) => f.type);

// ---- a clean measurement, and the ways to spoil it
const btn = (act, text, extra = {}) => ({ act, text, label: '', on: true, w: 88, h: 40, frac: 1, rect: { x: 0, y: 0, w: 88, h: 40 }, hit: 'self', hitFrac: 1, ...extra });
const text = (w = 300, h = 60, extra = {}) => ({ on: true, w, h, frac: 1, rect: { x: 0, y: 0, w, h }, text: 'Tap the buyer who needs a thin metal tool.', ...extra });
const clean = (extra = {}) => ({
  state: 'plain', step: 0, variant: 'base', view: { w: 360, h: 640 }, coarse: true, nControls: 30, controls: [], target: { via: 'dom', rect: { x: 10, y: 10, w: 40, h: 40 }, anchor: 'dock-market' },
  card: { rect: { x: 8, y: 200, w: 344, h: 200 }, cls: 'full', folded: false, side: 'float', host: 'page', say: text(), hint: null, where: null, grab: null, stranded: false, toasts: [],
    buttons: [btn('ac-showme', 'Show me'), btn('ac-skip', 'Skip lesson')] }, ...extra });
const withCard = (o, extra = {}) => { const m = clean(extra); m.card = { ...m.card, ...o }; return m; };
const tab = (hint = false) => withCard({ folded: true, cls: 'handle', say: text(1, 1, { w: 1, h: 1 }), hint: hint ? text(1, 1, { w: 1, h: 1 }) : null, rect: { x: 8, y: 588, w: 123, h: 44 },
  grab: text(80, 20), buttons: [btn('ac-expand', hint ? 'Hint' : 'Step 2 of 4', { label: `Lesson card, step 2 of 4${hint ? ', with a hint' : ''}. Open it to read.` })] }, { variant: hint ? 'hint' : 'base' });
const covered = (kind, o = {}) => ({ what: 'button "Close Market"', kind, rect: { x: 300, y: 300, w: 40, h: 40 }, overlapW: 40, overlapH: 12, cover: 30, tapsInCard: 8, taps: 26, centre: 'card', ...o });

test('the judge: a clean card, in the page or in a window, has no fault', () => {
  assert.deepEqual(SW.judge(clean()), []);
  assert.deepEqual(SW.judge(withCard({ host: 'dlg' }, { modal: 'deal' })), []);
  assert.deepEqual(SW.judge(clean({ variant: 'hint', card: { ...clean().card, hint: text(300, 40), buttons: [btn('ac-showme', 'Show me'), btn('ac-skip', 'Skip lesson'), btn('ac-restart', 'Restart')] } })), []);
});

test('the judge: a card over a control is a fault by the control\'s kind, whether the boxes overlap or only a sampled tap lands on the card, and a graze is not', () => {
  for (const kind of ['drawer-head', 'drawer', 'dock', 'hud', 'camera', 'tracker', 'ticker', 'dialog']) assert.deepEqual(types(clean({ controls: [covered(kind)] })), ['covers-' + kind]);
  assert.deepEqual(types(clean({ controls: [covered('dock', { overlapW: 0, overlapH: 0, tapsInCard: 1 })] })), ['covers-dock'], 'one tap in 26 landing on the card is a control lost');
  assert.deepEqual(types(clean({ controls: [covered('dock', { overlapW: 0.2, overlapH: 20, tapsInCard: 0 })] })), [], 'boxes that meet at a fifth of a pixel are not a cover');
  assert.deepEqual(types(clean({ controls: [covered('dock'), covered('hud')] })), ['covers-dock', 'covers-hud'], 'each control is a fault of its own');
});

test('the judge: the card over the thing the step names (when it is small) is a fault; over a panel that fills the window it is not', () => {
  const t = (rect, via = 'dom') => ({ via, anchor: 'dock-market', rect });
  assert.deepEqual(types(clean({ target: t({ x: 100, y: 250, w: 40, h: 40 }) })), ['covers-target']);
  assert.deepEqual(types(clean({ target: t({ x: 0, y: 0, w: 340, h: 500 }) })), [], 'a whole panel is not one thing to keep clear: its controls are');
  assert.deepEqual(types(clean({ target: t({ x: 0, y: 0, w: 360, h: 640 }, 'fallback') })), [], 'the whole world is a fallback frame, not a target');
});

test('the judge: the step\'s words and the hint must be on the screen at a size a person can read', () => {
  assert.deepEqual(types(withCard({ say: text(1, 1) })), ['words-hidden'], 'drawn at 1 by 1 (the card\'s head-and-buttons shape did this)');
  assert.deepEqual(types(withCard({ say: { ...text(), on: false } })), ['words-hidden']);
  assert.deepEqual(types(withCard({ say: { ...text(), frac: 0.6 } })), ['words-hidden'], 'cut by the card\'s own scroll');
  assert.deepEqual(types(withCard({ say: null })), ['words-hidden']);
  const hinted = (hint, o = {}) => withCard({ hint, buttons: [btn('ac-showme', 'Show me'), btn('ac-skip', 'Skip lesson'), btn('ac-restart', 'Restart')], ...o }, { variant: 'hint' });
  assert.deepEqual(types(hinted(text(300, 40))), []);
  assert.deepEqual(types(hinted(text(1, 1))), ['hint-hidden'], 'the hint at 0 by 0: a player who is stuck never sees it');
  assert.deepEqual(types(hinted(null)), ['hint-hidden']);
  assert.deepEqual(types(hinted(text(300, 40), { buttons: [btn('ac-showme', 'Show me'), btn('ac-skip', 'Skip lesson')] })), ['own-missing'], 'with the hint due, Restart must be there');
});

test('the judge: the card\'s own buttons must be there, whole, and take a tap', () => {
  const only = (...b) => withCard({ buttons: b });
  assert.deepEqual(types(only(btn('ac-skip', 'Skip lesson'))), ['own-missing']);
  assert.deepEqual(types(only(btn('ac-showme', 'Show me', { on: false, w: 0, h: 0 }), btn('ac-skip', 'Skip lesson'))), ['own-missing']);
  assert.deepEqual(types(only(btn('ac-showme', 'Show me', { frac: 0.5 }), btn('ac-skip', 'Skip lesson'))), ['own-clipped']);
  assert.deepEqual(types(only(btn('ac-showme', 'Show me', { hit: 'other:3' }), btn('ac-skip', 'Skip lesson'))), ['own-covered']);
  assert.deepEqual(types(clean({ variant: 'confirm', card: { ...clean().card, buttons: [btn('ac-skip-yes', 'Yes, skip it'), btn('ac-skip-no', 'Keep going')] } })), [], 'the question has its own two buttons');
  assert.deepEqual(types(clean({ variant: 'confirm' })), ['own-missing', 'own-missing']);
  assert.deepEqual(types(clean({ variant: 'stranded', card: { ...clean().card, stranded: true, buttons: [btn('ac-restart', 'Restart'), btn('ac-skip', 'Skip lesson')] } })), []);
});

test('the judge: a card folded to its tab is clean when the tab is named and the words are kept for a screen reader; a tab with no name, or no words behind it, is not', () => {
  assert.deepEqual(SW.judge(tab()), []);
  assert.deepEqual(SW.judge(tab(true)), []);
  const bare = tab(); bare.card.buttons = [btn('ac-expand', '', { label: '' })];
  assert.deepEqual(types(bare), ['tab-unnamed']);
  const noHint = tab(true); noHint.card.buttons = [btn('ac-expand', 'Step 2 of 4', { label: 'Lesson card, step 2 of 4. Open it to read.' })];
  assert.deepEqual(types(noHint), ['tab-unnamed'], 'with the hint due the tab says Hint');
  const mute = tab(); mute.card.say = null;
  assert.deepEqual(types(mute), ['tab-unnamed'], 'a folded card keeps its words in the page');
  const gone = tab(); gone.card.buttons = [];
  assert.deepEqual(types(gone), ['tab-unnamed']);
  const hidden = tab(); hidden.card.buttons = [btn('ac-expand', 'Step 2 of 4', { label: 'Lesson card, step 2 of 4.', hit: 'card' })];
  assert.deepEqual(types(hidden), ['own-covered'], 'the tab itself must take a tap');
  // and a folded card covers nothing by being folded: it is judged for what it covers like any other
  const over = tab(); over.controls = [covered('dock')];
  assert.deepEqual(types(over), ['covers-dock']);
});

test('the judge: the card the player opened (from its tab, or by asking to skip) must show everything and may cover what it covers; it must offer Fold away', () => {
  const ALL = [btn('ac-showme', 'Show me'), btn('ac-skip', 'Skip lesson'), btn('ac-restart', 'Restart'), btn('ac-fold', 'Fold away')];
  const opened = (extra = {}, o = {}) => withCard({ buttons: ALL, hint: text(300, 40), ...o }, { variant: 'hint+open', controls: [covered('drawer')], ...extra });
  assert.deepEqual(types(opened()), [], 'covering is not judged for a card the player asked for');
  assert.deepEqual(types(opened({}, { hint: null })), ['hint-hidden']);
  assert.deepEqual(types(opened({}, { say: text(300, 60, { frac: 0.7 }) })), ['words-hidden']);
  assert.deepEqual(types(opened({}, { buttons: ALL.slice(0, 3) })), ['own-missing'], 'no Fold away: nothing puts the card back');
});

test('the judge: a card outside the window, a toast on the words, and no card are faults', () => {
  assert.deepEqual(types(withCard({ rect: { x: 8, y: 500, w: 344, h: 200 } })), ['card-offscreen']);
  assert.deepEqual(types(withCard({ rect: { x: -20, y: 100, w: 344, h: 200 } })), ['card-offscreen']);
  assert.deepEqual(types(withCard({ toasts: [{ over: '.ac-say', area: 400, bad: false }] })), ['toast-over-card']);
  assert.deepEqual(types(withCard({ toasts: [{ over: '.ac-say', area: 400, bad: true }] })), [], 'a toast that says an action failed is never dimmed, and is the one the player needs');
  assert.deepEqual(types({ none: true, view: { w: 1, h: 1 } }), ['no-card']);
});

test('the tally and the table count each problem by size, and say how many cells are not clean', () => {
  const rows = [
    { size: '360x640', faults: [{ type: 'covers-dock' }, { type: 'words-hidden' }] }, { size: '360x640', faults: [] }, { size: '844x390', faults: [{ type: 'covers-dock' }] }, { size: '844x390', faults: [] }, { size: '844x390', faults: [] },
  ];
  const t = SW.tally(rows);
  assert.equal(t.types.get('covers-dock').get('360x640'), 1);
  assert.equal(t.types.get('covers-dock').get('844x390'), 1);
  assert.deepEqual(t.sizes.get('844x390'), { cells: 3, bad: 1, faults: 1 });
  const lines = SW.table(rows, ['844x390', '360x640']);
  assert.match(lines[0], /problem\s+844x390\s+360x640\s+total/);
  assert.match(lines.find((l) => l.startsWith('covers-dock')), /covers-dock\s+1\s+1\s+2/);
  assert.match(lines.find((l) => l.startsWith('cells with a fault')), /2\s+total|\s2$/);
});

test('the matrix: six sizes, two modes, ten lessons, six variants, and the levels grow by what they add', () => {
  assert.deepEqual(SW.SIZES.map((s) => s.id), ['1280x800', '1024x768', '768x1024', '844x390', '640x360', '360x640']);
  assert.deepEqual(SW.MODES, ['mouse', 'touch']);
  assert.equal(SW.LESSONS.length, 10);
  assert.deepEqual(SW.variantsFor('quick', 'plain'), ['base', 'hint']);
  assert.deepEqual(SW.variantsFor('full', 'drawer:market:end'), SW.VARIANTS);
  assert.ok(SW.variantsFor('std', 'drawer:market').includes('xl') && !SW.variantsFor('std', 'drawer:market:end').includes('xl'));
  const all = ['plain', 'drawer:market', 'drawer:market:end', 'deal:sell:pitch', 'deal:sell:pitch-done', 'deal:sell:close', 'deal:sell:close-done', 'deal:sell:result', 'hire', 'cash'];
  assert.ok(SW.statesFor('quick', all).length < SW.statesFor('std', all).length && SW.statesFor('std', all).length < SW.statesFor('full', all).length);
  assert.deepEqual(SW.statesFor('full', all), all);
});

// ====================================================================================================================================
// The rule, in its pure parts
// ====================================================================================================================================
test('freeSpots finds a place when one exists, exactly: a gap a grid steps over, between two buttons, is found; none is found when there is none', () => {
  const view = { w: 300, h: 200 }, card = { w: 100, h: 60 };
  const spots = A.freeSpots(card.w, card.h, view, 8, [{ x: 0, y: 0, w: 300, h: 100 }, { x: 0, y: 130, w: 300, h: 70 }]); // a band 30px high between two rows: the card is 60 high: none
  assert.deepEqual(spots, [], 'a band too thin for the card');
  const gap = A.freeSpots(card.w, card.h, view, 8, [{ x: 0, y: 0, w: 300, h: 70 }, { x: 0, y: 134, w: 300, h: 66 }]); // 64px between them: the card is 60 high
  assert.ok(gap.length > 0, 'a gap four pixels taller than the card is found');
  for (const p of gap) for (const b of [{ x: 0, y: 0, w: 300, h: 70 }, { x: 0, y: 134, w: 300, h: 66 }]) assert.ok(!A.rectsOverlap({ x: p.x, y: p.y, w: card.w, h: card.h }, b), 'no place found overlaps a blocker');
  const open = A.freeSpots(card.w, card.h, view, 8, []);
  assert.ok(open.some((p) => p.x === 8 && p.y === 8) && open.some((p) => p.x === 192 && p.y === 132), 'nothing in the way: the corners are places');
  assert.deepEqual(A.freeSpots(card.w, card.h, view, 8, [{ x: 0, y: 0, w: 300, h: 200 }]), [], 'a window that is all one button has no place');
});

test('placeCard: where no tidy place is clear it looks everywhere for one that touches no control, then for the one that covers the least of the rest', () => {
  const view = { w: 360, h: 640 }, card = { w: 344, h: 190 };
  // buttons from edge to edge but for a 200px band the card fits in (the first row ends at 240, the second starts at 440)
  const rows = [{ x: 0, y: 0, w: 360, h: 240, ctl: true, wt: 2 }, { x: 0, y: 440, w: 360, h: 200, ctl: true, wt: 2 }];
  const p = A.placeCard({ x: 150, y: 20, w: 60, h: 40 }, card, view, 14, 8, rows);
  assert.ok(p.y >= 240 && p.y + card.h <= 440, `the card is in the band (y ${p.y})`);
  // a panel (not a control) the band is crossed by: the card stands clear of it too when it can, and over it when it must
  const panel = { x: 0, y: 240, w: 360, h: 200, wt: 3 };
  const q = A.placeCard(null, { w: 344, h: 150 }, view, 14, 8, [...rows, panel]);
  assert.ok(q.y >= 240 && q.y + 150 <= 440, 'over the panel, never over a button');
  // no place at all: the least harm, as it always was (never over the keyboard's cursor)
  const full = [{ x: 0, y: 0, w: 360, h: 640, ctl: true, wt: 2 }, { x: 10, y: 10, w: 50, h: 50, focus: true, ctl: true, wt: 1000 }];
  const r = A.placeCard(null, { w: 344, h: 190 }, view, 14, 8, full);
  assert.ok(!A.rectsOverlap({ x: r.x, y: r.y, w: 344, h: 190 }, full[1]), 'the cursor is the first thing kept off');
});

test('chooseSize: the first size that stands clear of the cursor, the target and every control wins; where none does the card is its tab, and every size keeps the words', () => {
  assert.deepEqual(A.CARD_SIZES, ['full', 'slim'], 'the sizes that show the step\'s words; the shapes that dropped them are gone');
  const fits = (map) => (t) => ({ t, s: { w: 1, h: 1 }, p: { x: 0, y: 0 }, cursor: false, target: false, n: 0, ...(map[t] || {}) });
  const order = []; const rec = (map) => { const f = fits(map); return (t) => { order.push(t); return f(t); }; };
  assert.equal(A.chooseSize(rec({}), { handle: true }).t, 'full');
  assert.equal(A.chooseSize(fits({ full: { n: 2 } }), { handle: true }).t, 'slim');
  assert.equal(A.chooseSize(fits({ full: { n: 2 }, slim: { n: 1 } }), { handle: true }).t, 'narrow', 'a narrow column is tried after slim, in every window');
  assert.equal(A.chooseSize(fits({ full: { n: 2 }, slim: { target: true }, narrow: { n: 1 } }), { handle: true }).t, 'handle', 'none is clear: the tab, not the card that hides least');
  assert.equal(A.chooseSize(fits({ full: { cursor: true }, slim: { cursor: true }, narrow: { cursor: true } }), { handle: true }).t, 'handle', 'the tab, even when every card hides the cursor');
  order.length = 0; A.chooseSize(rec({ full: { n: 1 }, slim: { n: 1 }, narrow: { n: 1 } }), { handle: true });
  assert.deepEqual(order, ['full', 'slim', 'narrow', 'handle']);
  // the card that must be shown (the question asking to skip: handle false) is the one that hides the least, never the cursor, a tie to the larger
  assert.equal(A.chooseSize(fits({ full: { n: 3 }, slim: { n: 1 }, narrow: { n: 2 } })).t, 'slim');
  assert.equal(A.chooseSize(fits({ full: { cursor: true }, slim: { n: 2 }, narrow: { n: 5 } })).t, 'slim', 'never over the cursor while one size is not');
  assert.equal(A.chooseSize(fits({ full: { n: 2 }, slim: { n: 2 }, narrow: { n: 2 } })).t, 'full', 'a tie goes to the larger card');
  assert.equal(A.chooseSize(fits({ full: { cursor: true }, slim: { cursor: true }, narrow: { cursor: true } })).t, 'full', 'every size over the cursor: the full card, as it always was');
  // what the lesson asks the player to READ (the seller's reply, the result line) is not a control: a size that covers it gives way to a smaller one that does not (a wider font made the full card 11 px taller than the room under it on a runner, and it stood over the top of the reply), but never to the tab, and never over a control
  assert.equal(A.chooseSize(fits({ full: { read: 1 } }), { handle: true }).t, 'slim', 'a size that covers a reply gives way to the next that does not');
  assert.equal(A.chooseSize(fits({ full: { read: 1 }, slim: { read: 2 }, narrow: { read: 1 } }), { handle: true }).t, 'full', 'where every size covers something to read, the first that touches no control stands (not the tab)');
  assert.equal(A.chooseSize(fits({ full: { read: 1 }, slim: { n: 1 }, narrow: { n: 1 } }), { handle: true }).t, 'full', 'a control covered outranks a reply covered: the card that covers the reply stands, not the one that covers a button');
  assert.equal(A.chooseSize(fits({ full: { read: 1 }, slim: { read: 0 } })).t, 'slim', 'the card that must be shown follows the same preference');
  const all = { x: 0, y: 0, w: 1000, h: 800, wt: 0.4, ctl: false, read: true }, f = A.fitCard('full', { w: 100, h: 100 }, null, { w: 1000, h: 800 }, [all]);
  assert.equal(f.read, 1, 'fitCard counts what to read that the card covers'); assert.equal(f.n, 0, 'and it is not a control');
  assert.equal(A.fitCard('full', { w: 100, h: 100 }, null, { w: 1000, h: 800 }, []).read, 0);
  // the card the player opened: the full card, wherever it covers least, never the tab
  order.length = 0; assert.equal(A.chooseSize(rec({ full: { n: 4 } }), { handle: true, words: true }).t, 'full'); assert.deepEqual(order, ['full']);
  // ... and in a window too short for its words (they would scroll inside it and hide the hint): the same words across the strip's width, then that without the notes; where none fits, the shortest, as it scrolls
  order.length = 0; assert.equal(A.chooseSize(rec({ full: { n: 4, cut: true }, wide: { n: 4 } }), { handle: true, words: true }).t, 'wide'); assert.deepEqual(order, ['full', 'wide'], 'the narrow card is not the player\'s: it is taller');
  order.length = 0; assert.equal(A.chooseSize(rec({ full: { cut: true }, wide: { cut: true } }), { handle: true, words: true }).t, 'wideslim'); assert.deepEqual(order, ['full', 'wide', 'wideslim']);
  order.length = 0; assert.equal(A.chooseSize(rec({ full: { cut: true }, wide: { cut: true }, wideslim: { cut: true } }), { handle: true, words: true }).t, 'wideslim'); assert.deepEqual(order, ['full', 'wide', 'wideslim', 'wideslim'], 'none fits: the shortest, scrolling');
  assert.equal(A.chooseSize(fits({ full: { cut: true, cursor: true }, wide: { cursor: true } }), { handle: false, words: true }).t, 'wide', 'covering is theirs to ask for; the words behind a scroll are not');
  assert.deepEqual(A.OPEN_SIZES, ['full', 'wide', 'wideslim'], 'the shapes of the card the player opened');
});

test('fitCard: the tab in the strip hides nothing, whatever the room is made of; anywhere else it is placed like a card', () => {
  const view = { w: 360, h: 640 }, tabSize = { w: 123, h: 44 }, everything = [{ x: 0, y: 0, w: 360, h: 640, ctl: true, wt: 2 }];
  const f = A.fitCard('handle', tabSize, null, view, everything, { h: 56 });
  assert.deepEqual([f.cursor, f.target, f.n], [false, false, 0]);
  assert.equal(f.p.x, 8);
  assert.equal(f.p.y, 640 - 56 + (56 - 44) / 2, 'in the middle of the strip\'s height');
  const g = A.fitCard('handle', tabSize, null, view, everything);
  assert.ok(g.n > 0, 'no strip, no place that is clear: the tab is placed where it covers least');
  assert.deepEqual(A.tabSpot(view, 52, tabSize), { x: 8, y: 592, side: 'float' });
});

test('smallWindow: a window is small when it is under 44rem high or 46rem wide, in the page\'s own rem, so a bigger text size is a smaller window', () => {
  assert.equal(A.smallWindow({ w: 1280, h: 800 }, 16), false);
  assert.equal(A.smallWindow({ w: 1024, h: 768 }, 16), false);
  assert.equal(A.smallWindow({ w: 768, h: 1024 }, 16), false);
  assert.equal(A.smallWindow({ w: 844, h: 390 }, 16), true);
  assert.equal(A.smallWindow({ w: 640, h: 360 }, 16), true);
  assert.equal(A.smallWindow({ w: 360, h: 640 }, 16), true);
  assert.equal(A.smallWindow({ w: 1280, h: 800 }, 22), true, 'the largest text size makes a laptop small');
});

// ====================================================================================================================================
// The source
// ====================================================================================================================================
test('the script and the sheet: no shape drops the step\'s words, every size keeps the hint, the card may fold everywhere but at the question, and the strip is reserved', () => {
  const js = read('js/ui/academy.js'), css = read('css/ui-academy.css');
  assert.match(js, /const TIERS = \{ full: '', slim: 'slim', narrow: 'slim narrow', handle: 'handle' \}/, 'four shapes: the card, slim, narrow and the tab');
  assert.doesNotMatch(js, /compact|'min'/, 'the head-and-buttons shapes are gone');
  assert.match(js, /const foldable = !confirm;/, 'the card folds wherever it is; only the question "Skip this lesson?" stays where it is');
  assert.match(js, /setStrip\(smallWindow\(view, /, 'the strip is reserved in a small window, measured in the page\'s own rem');
  assert.match(js, /CONTROL_SELECTOR/, 'the placer asks the page for every control');
  assert.doesNotMatch(css, /\.ac-coach\.(compact|min)\b/, 'no sheet rule for a shape that is not drawn');
  assert.match(css, /\.ac-coach\.slim :is\(\.ac-look, \.ac-where\) \{ display: none; \}/, 'slim drops the notes under the words and keeps the hint');
  assert.match(css, /html\.ac-strip \{ --edge-b: /, 'the strip is the gutter under the dock made deeper');
  assert.match(css, /html\.ac-strip dialog#dlg \{ inset-block-end: var\(--ac-strip\)/, 'and a window ends above it');
  assert.match(read('js/ui/shell.js'), /relayout\(\) \{ measure\(\)/, 'the shell can be asked to measure again once the strip has moved its pieces');
});

test('the selector the placer keeps off is a superset of the one the sweep judges by: a control the sweep counts is a control the card is placed clear of', () => {
  const page = read('scripts/academy-sweep-page.js'), m = /const CONTROLS = '([^']+)'/.exec(page);
  assert.ok(m, 'the sweep\'s selector is in its page file');
  const split = (sel) => sel.split(/,\s*(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
  const mine = new Set(split(A.CONTROL_SELECTOR));
  for (const part of split(m[1])) assert.ok(mine.has(part), `the card keeps off ${part}`);
});
