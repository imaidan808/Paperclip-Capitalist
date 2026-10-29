// Track A1 of the second finish: the Academy's coach card against the Deal Room at phone sizes (844x390, 360x640 and 640x360, which is a desktop window at 200% zoom).
// A browser audit with real taps at the control centres found the card over the Deal Room's own buttons: "Aim high" landed on the card's Skip lesson button (lessons 3 and 4), "Bid $309" on its text
// (lesson 10), "Careful: pay more, no timing" on a card button (lesson 5), "Check the serial", the Scarcity angle and "Pitch Scarcity and Prestige" (lessons 2 and 3) and, with the 20-second hint showing, "Done
// reading" and "Pass on this lot" (lessons 2 and 10). The card counted only the control the keyboard is on, the control a step names and a drawer's buttons; the room's own buttons were not controls to it.
//   The fix (js/ui/academy.js, js/ui/academy-sandbox.js, css/ui-academy.css): every button and link of the Deal Room is a control the card keeps off (`keepClear`: `ctl`, cut to the sheet it scrolls in), in
//   the same order of harm (the keyboard's cursor, the control the step names, the buttons covered, then the area); a Deal Room's card may also be the narrow card (the words in a 15rem column, for the empty
//   column beside the room's buttons on a phone on its side) and, where even the head-and-two-buttons card covers a button, a one-line tab (`handle`) that opens the card on a tap and folds away again.
// Pure half: the rule (chooseSize, fitCard, keepClear) and the measured rooms, swept over every position of the sheet. Browser half (skipped without Chrome or with PC_NO_BROWSER=1): real taps in headless Chrome.
// Run: node --test tests/rep-card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };

const A = await import('../js/ui/academy-sandbox.js');
const AC = await import('../js/ui/academy.js');
const { ACADEMY } = await import('../js/meta/academy.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const M = (id) => ACADEMY.find((m) => m.id === id);
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ====================================================================================================================================
// the rule
// ====================================================================================================================================

/** A fit() for chooseSize from a table of what each shape would hide, recording the shapes it was asked about. */
const table = (t) => { const asked = []; const fit = (name) => { asked.push(name); return { t: name, cursor: false, target: false, n: 0, ...t[name] }; }; fit.asked = asked; return fit; };

test('chooseSize: the old four sizes are what it asks for unless the Deal Room asks for more, and a clear one is kept', () => {
  const f = table({ full: { n: 2 }, slim: { n: 2 }, compact: { n: 2 }, min: { n: 2 }, narrow: { n: 0 }, handle: { n: 0 } });
  assert.equal(A.chooseSize(f).t, 'full', 'no option: the old rule, ties go to the larger card');
  assert.deepEqual(f.asked, ['full', 'slim', 'compact', 'min'], 'and neither the narrow card nor the handle is ever asked for');
  const g = table({ full: { n: 0 }, narrow: { n: 0 }, handle: { n: 0 } });
  assert.equal(A.chooseSize(g, { handle: true, narrow: true }).t, 'full', 'a clear full card is kept');
  assert.deepEqual(g.asked, ['full'], 'and nothing else is looked at');
});

test('chooseSize (narrow): between slim and compact, so the step\'s words are kept where a card of the usual width cannot stand', () => {
  const f = table({ full: { n: 2 }, slim: { n: 2 }, narrow: { n: 0 }, compact: { n: 0 }, min: { n: 0 } });
  assert.equal(A.chooseSize(f, { narrow: true }).t, 'narrow', 'the narrow card, which has the words, before the compact card, which has none');
  assert.equal(A.chooseSize(table({ full: { n: 2 }, slim: { n: 2 }, narrow: { n: 1 }, compact: { n: 0 } }), { narrow: true }).t, 'compact', 'a narrow card that still covers a button loses to a compact one that does not');
  assert.equal(A.chooseSize(table({ full: { n: 2 }, slim: { n: 0 } }), { narrow: true }).t, 'slim', 'and slim, clear, is taken first');
  assert.deepEqual(A.CARD_SIZES, ['full', 'slim', 'compact', 'min'], 'the four sizes are as they were');
});

test('chooseSize (handle): the last resort, taken only when it hides less than the best card, and never over the keyboard\'s cursor', () => {
  const crowded = { full: { n: 3 }, slim: { n: 3 }, compact: { n: 2 }, min: { n: 1 } };
  assert.equal(A.chooseSize(table({ ...crowded, handle: { n: 0 } }), { handle: true }).t, 'handle', 'no size is clear and the tab is: the tab');
  assert.equal(A.chooseSize(table({ ...crowded, handle: { n: 0 } })).t, 'min', 'without the option the old rule: the card that covers the fewest');
  assert.equal(A.chooseSize(table({ ...crowded, handle: { n: 1 } }), { handle: true }).t, 'min', 'a tie keeps the card: it has more to read');
  assert.equal(A.chooseSize(table({ ...crowded, handle: { n: 2 } }), { handle: true }).t, 'min', 'the tab that covers more is not taken');
  assert.equal(A.chooseSize(table({ ...crowded, handle: { n: 0, cursor: true } }), { handle: true }).t, 'min', 'a tab over the cursor is never taken');
  assert.equal(A.chooseSize(table({ full: { cursor: true }, slim: { cursor: true }, compact: { cursor: true }, min: { cursor: true }, handle: { n: 0 } }), { handle: true }).t, 'handle', 'every card hides the cursor and the tab does not: the tab');
  assert.equal(A.chooseSize(table({ full: { cursor: true }, slim: { cursor: true }, compact: { cursor: true }, min: { cursor: true }, handle: { cursor: true } }), { handle: true }).t, 'full', 'all of them hide it: the full card, as it always was');
  assert.equal(A.chooseSize(table({ full: { target: true }, slim: { target: true }, compact: { target: true }, min: { target: true }, handle: { n: 0 } }), { handle: true }).t, 'handle', 'every card is over the control the step names: the tab, which is not');
  assert.equal(A.chooseSize(table({ ...crowded, compact: { n: 0 } }), { handle: true }).t, 'compact', 'a card that is clear is taken before the tab is looked at');
});

test('chooseSize (words): a player who opened the card is shown the full card, wherever it covers least, and never the tab', () => {
  const f = table({ full: { n: 4 }, slim: { n: 0 }, narrow: { n: 0 }, compact: { n: 0 }, min: { n: 0 }, handle: { n: 0 } });
  assert.equal(A.chooseSize(f, { words: true, handle: true, narrow: true }).t, 'full');
  assert.deepEqual(f.asked, ['full'], 'only the full card is asked about: it is the one with the words, the hint and the notes');
});

test('fitCard weighs a shape by what it covers: the keyboard\'s cursor, the control the step names and the buttons', () => {
  const view = { w: 400, h: 400 }, size = { w: 100, h: 100 };
  const keep = [{ x: 0, y: 0, w: 400, h: 400, wt: 1, ctl: true }];
  const f = A.fitCard('full', size, null, view, keep);
  assert.equal(f.n, 1, 'a button under the card is counted'); assert.equal(f.cursor, false); assert.equal(f.target, false);
  assert.equal(A.fitCard('full', size, null, view, [{ x: 0, y: 0, w: 400, h: 400, wt: 1 }]).n, 0, 'a rect that is not a control (a line to read) is not');
  assert.equal(A.fitCard('full', size, null, view, [{ x: 0, y: 0, w: 400, h: 400, wt: 1000, focus: true }]).cursor, true, 'the control the keyboard is on');
  assert.equal(A.fitCard('full', size, { x: 0, y: 0, w: 400, h: 400 }, view, []).target, true, 'and the control the step names');
});

test('keepClear: every control is a button the card keeps off (ctl), cut to the part of the sheet it is seen in', () => {
  const clip = { x: 0, y: 0, w: 300, h: 300 };
  const keep = A.keepClear({ controls: [{ x: 10, y: 10, w: 50, h: 20 }, { x: 250, y: 280, w: 100, h: 100 }, { x: 10, y: 400, w: 50, h: 20 }, { x: 5, y: 5, w: 0, h: 9 }, null, undefined], clip });
  assert.equal(keep.length, 2, 'a control scrolled out of the sheet, a rect with no area and a missing one are left out');
  assert.ok(keep.every((r) => r.ctl === true && r.wt === 1), 'the rest are controls of weight 1');
  assert.deepEqual(keep[1], { x: 250, y: 280, w: 50, h: 20, wt: 1, ctl: true }, 'a control half out of the sheet counts for the half that can be seen');
  assert.deepEqual(A.keepClear({ drawer: { x: 0, y: 0, w: 10, h: 10 }, dock: { x: 0, y: 20, w: 10, h: 10 } }).map((r) => [r.wt, !!r.ctl]), [[3, false], [3, false]], 'the drawer and the dock are not controls themselves (their buttons are listed one by one)');
  assert.deepEqual(A.keepClear(), [], 'nothing in, nothing out');
});

// ====================================================================================================================================
// the measured rooms, swept over every position of the sheet
// ====================================================================================================================================

/**
 * The Deal Room's stage as measured in headless Chrome at each size (the buttons in the sheet's own coordinates at scroll 0 and whether each is in the sticky foot; the card's size in each shape, and
 * the two that differ with the 20-second hint showing): lesson 2's Read stage, lesson 3's Pitch, lesson 4's Close, lesson 5's Fix and lesson 10's Bid. controls: [x, y, w, h, sticky, label].
 */
const ROOMS = [
  { name: "lesson 2, Read at 844x390", view: [844, 390], dlg: [19, 4, 806, 382], scrollH: 802, clientH: 378,
    sizes: { full: [344, 264], slim: [344, 205], narrow: [240, 267], compact: [344, 129], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 378], narrow: [240, 304], compact: [344, 245] },
    controls: [[660, 23, 18, 18, 0, ""], [745, 17, 62, 30, 0, "LEAVE"], [263, 305, 172, 108, 0, "Look it over 1"], [443, 305, 172, 108, 0, "Check the seri"], [622, 305, 172, 108, 0, "Power it up 2 "], [263, 421, 172, 108, 0, "Read the paper"], [443, 421, 172, 108, 0, "Hire an expert"], [263, 640, 140, 38, 0, "DONE READING"], [412, 640, 176, 38, 0, "PASS ON THIS L"], [348, 340, 330, 38, 1, "QUICK: AUTO-PL"], [685, 340, 122, 38, 1, "QUICK DEAL"]] },
  { name: "lesson 2, Read at 360x640", view: [360, 640], dlg: [0, 0, 360, 640], scrollH: 1359, clientH: 636,
    sizes: { full: [344, 264], slim: [344, 205], narrow: [240, 267], compact: [344, 129], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 298], narrow: [240, 298], compact: [344, 245] },
    controls: [[135, 53, 18, 18, 0, ""], [224, 47, 62, 30, 0, "LEAVE"], [26, 590, 150, 108, 0, "Look it over 1"], [184, 590, 150, 108, 0, "Check the seri"], [26, 706, 150, 125, 0, "Power it up 2 "], [184, 706, 150, 125, 0, "Read the paper"], [26, 839, 150, 108, 0, "Hire an expert"], [26, 1134, 140, 38, 0, "DONE READING"], [26, 1182, 176, 38, 0, "PASS ON THIS L"], [13, 586, 225, 46, 1, "QUICK: AUTO-PL"], [244, 586, 103, 46, 1, "QUICK DEAL"]] },
  { name: "lesson 2, Read at 640x360", view: [640, 360], dlg: [0, 0, 640, 360], scrollH: 1124, clientH: 356,
    sizes: { full: [624, 199], slim: [624, 159], narrow: [240, 267], compact: [624, 110], min: [624, 69], handle: [123, 44] }, hint: { full: [624, 278], narrow: [240, 304], compact: [624, 187] },
    controls: [[477, 24, 18, 18, 0, ""], [566, 18, 62, 30, 0, "LEAVE"], [26, 521, 290, 99, 0, "Look it over 1"], [324, 521, 290, 99, 0, "Check the seri"], [26, 628, 290, 99, 0, "Power it up 2 "], [324, 628, 290, 99, 0, "Read the paper"], [26, 735, 290, 99, 0, "Hire an expert"], [26, 951, 140, 38, 0, "DONE READING"], [175, 951, 176, 38, 0, "PASS ON THIS L"], [13, 310, 505, 42, 1, "QUICK: AUTO-PL"], [524, 310, 103, 42, 1, "QUICK DEAL"]] },
  { name: "lesson 3, Pitch at 844x390", view: [844, 390], dlg: [19, 4, 806, 382], scrollH: 784, clientH: 378,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 267], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 323], narrow: [240, 304], compact: [344, 168] },
    controls: [[660, 26, 18, 18, 0, ""], [745, 20, 62, 30, 0, "LEAVE"], [264, 334, 173, 139, 0, "Prestige statu"], [442, 334, 173, 138, 0, "Utility what i"], [620, 334, 173, 139, 0, "Scarcity rare,"], [264, 477, 173, 138, 0, "Price a bargai"], [442, 477, 173, 139, 0, "Story where it"], [263, 625, 194, 38, 0, "PICK 2 MORE AN"], [348, 340, 330, 38, 1, "QUICK: AUTO-PL"], [685, 340, 122, 38, 1, "QUICK DEAL"]] },
  { name: "lesson 3, Pitch at 360x640", view: [360, 640], dlg: [0, 0, 360, 640], scrollH: 1329, clientH: 636,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 267], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 298], narrow: [240, 298], compact: [344, 168] },
    controls: [[152, 73, 18, 18, 0, ""], [241, 67, 62, 30, 0, "LEAVE"], [28, 669, 148, 157, 0, "Prestige statu"], [184, 670, 148, 157, 0, "Utility what i"], [28, 834, 148, 142, 0, "Scarcity rare,"], [184, 834, 148, 142, 0, "Price a bargai"], [28, 983, 148, 157, 0, "Story where it"], [26, 1153, 194, 38, 0, "PICK 2 MORE AN"], [13, 586, 225, 46, 1, "QUICK: AUTO-PL"], [244, 586, 103, 46, 1, "QUICK DEAL"]] },
  { name: "lesson 3, Pitch at 640x360", view: [640, 360], dlg: [0, 0, 640, 360], scrollH: 1157, clientH: 356,
    sizes: { full: [624, 159], slim: [624, 159], narrow: [240, 267], compact: [624, 69], min: [624, 69], handle: [123, 44] }, hint: { full: [624, 238], narrow: [240, 304], compact: [624, 149] },
    controls: [[477, 27, 18, 18, 0, ""], [566, 21, 62, 30, 0, "LEAVE"], [28, 532, 288, 143, 0, "Prestige statu"], [324, 532, 288, 143, 0, "Utility what i"], [28, 681, 288, 143, 0, "Scarcity rare,"], [324, 682, 288, 143, 0, "Price a bargai"], [28, 831, 288, 143, 0, "Story where it"], [26, 986, 194, 38, 0, "PICK 2 MORE AN"], [13, 310, 505, 42, 1, "QUICK: AUTO-PL"], [524, 310, 103, 42, 1, "QUICK DEAL"]] },
  { name: "lesson 4, Close at 844x390", view: [844, 390], dlg: [19, 4, 806, 382], scrollH: 617, clientH: 378,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 290], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 303], narrow: [240, 327], compact: [344, 168] },
    controls: [[660, 26, 18, 18, 0, ""], [745, 20, 62, 30, 0, "LEAVE"], [263, 367, 172, 89, 0, "Aim high $13.6"], [443, 367, 172, 89, 0, "Fair $9.76 +0%"], [622, 367, 172, 89, 0, "Quick sale $6."], [263, 464, 94, 30, 0, "WALK AWAY"], [477, 340, 330, 38, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 4, Close at 360x640", view: [360, 640], dlg: [0, 0, 360, 640], scrollH: 1201, clientH: 636,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 290], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 298], narrow: [240, 298], compact: [344, 168] },
    controls: [[173, 73, 18, 18, 0, ""], [262, 67, 62, 30, 0, "LEAVE"], [26, 699, 308, 89, 0, "Aim high $13.6"], [26, 795, 308, 89, 0, "Fair $9.76 +0%"], [26, 892, 308, 89, 0, "Quick sale $6."], [26, 991, 94, 30, 0, "WALK AWAY"], [13, 590, 334, 42, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 4, Close at 640x360", view: [640, 360], dlg: [0, 0, 640, 360], scrollH: 889, clientH: 356,
    sizes: { full: [624, 159], slim: [624, 159], narrow: [240, 290], compact: [624, 69], min: [624, 69], handle: [123, 44] }, hint: { full: [624, 218], narrow: [240, 327], compact: [624, 129] },
    controls: [[477, 27, 18, 18, 0, ""], [566, 21, 62, 30, 0, "LEAVE"], [26, 579, 191, 89, 0, "Aim high $13.6"], [225, 579, 191, 89, 0, "Fair $9.76 +0%"], [423, 579, 191, 89, 0, "Quick sale $6."], [26, 678, 94, 30, 0, "WALK AWAY"], [13, 310, 614, 42, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 5, Fix at 844x390", view: [844, 390], dlg: [19, 4, 806, 382], scrollH: 641, clientH: 378,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 267], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 323], narrow: [240, 304], compact: [344, 188] },
    controls: [[660, 23, 18, 18, 0, ""], [745, 17, 62, 30, 0, "LEAVE"], [263, 423, 87, 49, 0, "STOP"], [263, 479, 284, 38, 0, "CAREFUL: PAY M"], [477, 340, 330, 38, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 5, Fix at 360x640", view: [360, 640], dlg: [0, 0, 360, 640], scrollH: 1026, clientH: 636,
    sizes: { full: [344, 205], slim: [344, 205], narrow: [240, 267], compact: [344, 69], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 298], narrow: [240, 298], compact: [344, 188] },
    controls: [[160, 73, 18, 18, 0, ""], [248, 67, 62, 30, 0, "LEAVE"], [26, 749, 87, 49, 0, "STOP"], [26, 808, 284, 38, 0, "CAREFUL: PAY M"], [13, 590, 334, 42, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 5, Fix at 640x360", view: [640, 360], dlg: [0, 0, 640, 360], scrollH: 895, clientH: 356,
    sizes: { full: [624, 159], slim: [624, 159], narrow: [240, 267], compact: [624, 69], min: [624, 69], handle: [123, 44] }, hint: { full: [624, 238], narrow: [240, 304], compact: [624, 149] },
    controls: [[477, 27, 18, 18, 0, ""], [566, 21, 62, 30, 0, "LEAVE"], [26, 618, 87, 49, 0, "STOP"], [26, 677, 284, 38, 0, "CAREFUL: PAY M"], [13, 310, 614, 42, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 10, Bid at 844x390", view: [844, 390], dlg: [19, 4, 806, 382], scrollH: 670, clientH: 378,
    sizes: { full: [344, 241], slim: [344, 182], narrow: [240, 244], compact: [344, 129], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 360], narrow: [240, 281], compact: [344, 245] },
    controls: [[660, 23, 18, 18, 0, ""], [745, 17, 62, 30, 0, "LEAVE"], [48, 368, 179, 24, 0, "Talk so far"], [263, 390, 134, 157, 0, "BID $309"], [410, 436, 176, 65, 0, "Drop out keep "], [477, 340, 330, 38, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 10, Bid at 360x640", view: [360, 640], dlg: [0, 0, 360, 640], scrollH: 1110, clientH: 636,
    sizes: { full: [344, 241], slim: [344, 182], narrow: [240, 244], compact: [344, 129], min: [344, 69], handle: [123, 44] }, hint: { full: [344, 298], narrow: [240, 281], compact: [344, 245] },
    controls: [[147, 73, 18, 18, 0, ""], [236, 67, 62, 30, 0, "LEAVE"], [25, 316, 310, 30, 0, "Talk so far"], [26, 791, 112, 138, 0, "BID $309"], [146, 827, 176, 65, 0, "Drop out keep "], [13, 590, 334, 42, 1, "QUICK: AUTO-PL"]] },
  { name: "lesson 10, Bid at 640x360", view: [640, 360], dlg: [0, 0, 640, 360], scrollH: 945, clientH: 356,
    sizes: { full: [624, 176], slim: [624, 136], narrow: [240, 244], compact: [624, 110], min: [624, 69], handle: [123, 44] }, hint: { full: [624, 255], narrow: [240, 281], compact: [624, 187] },
    controls: [[477, 27, 18, 18, 0, ""], [566, 21, 62, 30, 0, "LEAVE"], [25, 254, 590, 30, 0, "Talk so far"], [26, 626, 112, 138, 0, "BID $309"], [146, 662, 176, 65, 0, "Drop out keep "], [13, 310, 614, 42, 1, "QUICK: AUTO-PL"]] },
];

/** The card's plan on one room at one scroll position, the way the runner makes it: keepClear for the room's buttons, the sizes measured for each shape, the Deal Room's options. */
function plan(R, scroll, { hint = false, fixed = true } = {}) {
  const view = { w: R.view[0], h: R.view[1] }, dlg = { x: R.dlg[0], y: R.dlg[1], w: R.dlg[2], h: R.dlg[3] };
  const controls = R.controls.map(([x, y, w, h, sticky]) => ({ x, y: sticky ? y : y - scroll, w, h }));
  const buttons = A.keepClear({ controls, clip: dlg });
  const keep = fixed ? buttons : buttons.map((r) => ({ ...r, ctl: false })); // `fixed: false` is the card before the fix: the room's buttons were rects to read, not controls
  const sizes = hint ? { ...R.sizes, ...R.hint } : R.sizes;
  const fit = (t) => A.fitCard(t, { w: sizes[t][0], h: sizes[t][1] }, null, view, keep);
  const pick = A.chooseSize(fit, fixed ? { handle: true, narrow: true } : {});
  const box = { x: pick.p.x, y: pick.p.y, w: pick.s.w, h: pick.s.h };
  return { pick, box, view, buttons, covered: buttons.filter((r) => overlaps(box, r)).length, taps: buttons.filter((r) => { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h; }).length };
}
/** Is there any place in the window, of this size, that is clear of every button? (a 4px grid) */
function clearPlace(buttons, view, w, h) {
  for (let y = 8; y <= view.h - h - 8; y += 4) for (let x = 8; x <= view.w - w - 8; x += 4) if (!buttons.some((r) => overlaps({ x, y, w, h }, r))) return true;
  return false;
}
const offsets = (R) => { const out = [], max = Math.max(0, R.scrollH - R.clientH); for (let s = 0; s <= max; s += 6) out.push(s); return out; };

test('the Deal Room, swept: at every position of the sheet the card covers no button, and the tap at the middle of every button lands on the button, unless no place is clear of the buttons', () => {
  let n = 0, tabs = 0, narrows = 0;
  for (const R of ROOMS) {
    for (const hint of [false, true]) {
      for (const s of offsets(R)) {
        const p = plan(R, s, { hint }); n++;
        assert.equal(p.taps, 0, `${R.name}, scrolled ${s}${hint ? ', hint' : ''}: the ${p.pick.t} card at ${Math.round(p.box.x)},${Math.round(p.box.y)} is over the middle of a button`);
        if (p.covered) assert.equal(clearPlace(p.buttons, p.view, R.sizes.handle[0], R.sizes.handle[1]), false, `${R.name}, scrolled ${s}${hint ? ', hint' : ''}: the ${p.pick.t} card covers ${p.covered} button(s) though the tab fits somewhere clear`);
        assert.ok(p.box.x >= -1e-6 && p.box.y >= -1e-6 && p.box.x + p.box.w <= p.view.w + 1e-6 && p.box.y + p.box.h <= p.view.h + 1e-6, `${R.name}: the card is inside the window`);
        if (p.pick.t === 'handle') tabs++; if (p.pick.t === 'narrow') narrows++;
      }
    }
  }
  assert.ok(n > 2500, `${n} positions held`);
  assert.ok(tabs > 50 && narrows > 150, `the tab stood in ${tabs} of them and the narrow card in ${narrows}: both are used where they are needed`);
});

test('the Deal Room, swept, before the fix: the same rooms with the buttons as rects to read and the four sizes covered a button at many positions of every size', () => {
  for (const [size, least] of [['844x390', 100], ['360x640', 60], ['640x360', 100]]) {
    let covered = 0, total = 0;
    for (const R of ROOMS.filter((r) => r.name.endsWith(size))) for (const s of offsets(R)) { const p = plan(R, s, { fixed: false }); total++; if (p.covered) covered++; }
    assert.ok(covered >= least, `${size}: the card covered a button at ${covered} of ${total} positions (the audit found it at nearly every tap)`);
  }
});

test('the Deal Room, the lessons\' own words: where the reported controls are, the card is the narrow card, a compact one or the tab, never the full card over them', () => {
  // lesson 3 at 360x640 with the Scarcity and Price angles in the middle of the sheet: no card of the usual width stands clear, the tab does
  const R = ROOMS.find((r) => r.name === 'lesson 3, Pitch at 360x640'), at = offsets(R).map((s) => ({ s, p: plan(R, s) }));
  assert.ok(at.some(({ p }) => p.pick.t === 'handle'), 'the Pitch stage on a phone needs the tab somewhere');
  const scarcity = R.controls.find((c) => /Scarcity/.test(c[5])), s0 = scarcity[1] - 150; // the Scarcity angle a little below the middle of the sheet
  const p = plan(R, Math.max(0, s0)), btn = { x: scarcity[0], y: scarcity[1] - Math.max(0, s0), w: scarcity[2], h: scarcity[3] };
  assert.equal(overlaps(p.box, btn), false, `the ${p.pick.t} card at ${Math.round(p.box.x)},${Math.round(p.box.y)} is off the Scarcity angle`);
  // lesson 3 at 844x390: the narrow card keeps the words
  const L = ROOMS.find((r) => r.name === 'lesson 3, Pitch at 844x390'), shapes = new Set(offsets(L).map((s) => plan(L, s).pick.t));
  assert.ok(shapes.has('narrow'), 'a phone on its side has an empty column beside the room, so the words stay: ' + [...shapes]);
  assert.ok(!shapes.has('handle') && !shapes.has('min') && !shapes.has('compact'), 'and it never needs the tab, or a card without the words');
});

// ====================================================================================================================================
// the runner, the markup and the sheet
// ====================================================================================================================================

test('the runner counts every button of the room, folds to the tab only in a Deal Room, and takes nothing from a screen reader', () => {
  const src = read('js/ui/academy.js'), css = read('css/ui-academy.css');
  assert.match(src, /for \(const r of keepClear\(\{ controls: mine\.map\(\(e\) => e\.getBoundingClientRect\(\)\), clip: host\.getBoundingClientRect\(\) \}\)\) out\.push\(\{ \.\.\.r, focus: false \}\);/, 'the room\'s buttons are controls, cut to the sheet they scroll in');
  assert.match(src, /const mine = \[\.\.\.host\.querySelectorAll\(CONTROLS\)\]\.filter\(\(e\) => e !== cardEl && !cardEl\?\.contains\(e\)\)/, 'every button, link, field and summary of the room, never the card\'s own');
  assert.match(src, /const dealRoom = host === dlg\.el && modal === 'deal', foldable = dealRoom && !confirm && !c\.stranded;/, 'the tab is the Deal Room\'s, and not for the question "Skip this lesson?" or a lesson that is closed');
  assert.match(src, /chooseSize\(fit, \{ handle: foldable && !open, narrow: foldable, words: foldable && open \}\)/);
  assert.match(src, /dlg\.el\.addEventListener\('scroll', later, true\)/, 'the card looks again when the room\'s sheet scrolls'); assert.match(src, /dlg\.el\.removeEventListener\('scroll', later, true\)/, 'and lets go of it');
  assert.match(src, /\[\.\.\.\(cardEl\?\.querySelectorAll\('button'\) \|\| \[\]\)\]\.find\(\(b\) => b\.getClientRects\(\)\.length\)\?\.focus\(\)/, 'C reaches the first button the card shows: the tab, when it is folded');
  assert.match(src, /announce\('The lesson card is folded to a tab/, 'a fold is said, once a step');
  assert.match(src, /'ac-expand'\(\) \{ open = true;/); assert.match(src, /'ac-fold'\(\) \{ open = false;/);
  assert.match(src, /document\.addEventListener\('click', onAway, true\)/); assert.match(src, /document\.removeEventListener\('click', onAway, true\)/, 'a press elsewhere folds an opened card away, and the listener goes with the lesson');
  assert.match(css, /\.ac-coach\.handle :is\(\.ac-say, \.ac-hint, \.ac-look, \.ac-where, \.ac-lost\) \{ position: absolute; width: 1px; height: 1px;[^}]*clip: rect\(0 0 0 0\)/, 'the words of a folded card are clipped, never display: none: a screen reader still has them');
  assert.doesNotMatch(css, /\.ac-coach\.handle[^{]*\.ac-say[^{]*\{[^}]*display: none/, 'and the live region the card announces its step in is not the card');
  assert.match(css, /\.ac-coach\.narrow \{ width: min\(15rem, calc\(100vw - 1rem\)\); \}/); assert.match(css, /\.ac-coach\.handle \{ width: max-content;/);
});

test('coachHTML: the tab is a button that opens the card, the opened card has Fold away, and a card made without them says what it always said', () => {
  const c = A.coachFor(M('m03'), A.startRun(M('m03')));
  const plain = AC.coachHTML(c, { title: 'x' });
  assert.doesNotMatch(plain, /ac-grab|ac-expand|ac-fold/, 'no tab and no fold button unless the Deal Room asks');
  const folded = AC.coachHTML(c, { title: 'x', fold: true });
  assert.match(folded, /<button class="ac-grab" data-act="ac-expand" aria-expanded="false" title="Read the lesson card" aria-label="Lesson card, step 1 of 3\. Open it to read\.">Step 1 of 3<\/button>/, 'the tab is a button with a name, a title and the step');
  assert.match(folded, /<p class="ac-say" id="ac-say">/, 'and the words are in the page for the screen reader');
  assert.doesNotMatch(folded, /ac-fold/, 'no Fold away on the tab');
  assert.match(AC.coachHTML(c, { title: 'x', fold: true, hint: true }), /aria-label="Lesson card, step 1 of 3, with a hint\. Open it to read\.">Hint<\/button>/, 'with the hint on the tab says so');
  const opened = AC.coachHTML(c, { title: 'x', fold: true, open: true });
  assert.match(opened, /<button class="btn sm ghost" data-act="ac-fold" aria-expanded="true">Fold away<\/button>/); assert.match(opened, /data-act="ac-showme"/, 'and the rest of the card');
  assert.match(AC.coachHTML({ ...c, finishing: true }, { title: 'x', fold: true }), />Last step<\/button>/);
  const evil = AC.coachHTML({ index: 0, total: 1, say: 's' }, { title: 'x', fold: true });
  assert.ok(!/undefined|NaN/.test(evil), 'no word of it is undefined');
});

// ====================================================================================================================================
// real taps in a real browser (headless Chrome: Input.dispatchMouseEvent at the centre of the control)
// ====================================================================================================================================
// Every control a lesson tells the player to press is pressed by a real tap at its centre, the way the audit did it. Before the tap the control is brought into view the way a finger does it (the sheet
// scrolled so the control is in the middle of it, or only just in view), the card is given time to settle (it looks again every 200 ms and glides for 250), and then two things are measured and asserted:
// the card covers none of the control (0%), and the element under the point of the tap is the control. The hint is made due by moving the clock the Academy reads (performance.now) 30 seconds on.

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BROWSER = !process.env.PC_NO_BROWSER && existsSync(CHROME);
const freePort = async () => { const { createServer } = await import('node:net'); return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };
let shared = null;
async function browser() {
  if (shared) return shared;
  const { createServer } = await import('node:http'), { handler } = await import('../server/static.mjs'), { launch, open } = await import('../scripts/cdp.mjs');
  const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = await launch(await freePort()), base = `http://127.0.0.1:${server.address().port}`;
  shared = { base, chrome, open, close: async () => { chrome.close(); await new Promise((ok) => server.close(ok)); shared = null; } };
  return shared;
}
test.after(async () => { if (shared) await shared.close(); });

const SIZES = [{ w: 844, h: 390, dsf: 2, mobile: true }, { w: 360, h: 640, dsf: 2, mobile: true }, { w: 640, h: 360, dsf: 2, mobile: false }]; // two phones, and a desktop window at 200% zoom
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (p, expr, what, ms = 45000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between screens */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`); };
const IDS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];
/** A fresh page with the lessons before `lesson` marked done, on the lesson's first card. The page is waited for as the NEW document (a marker on the old one), never by a sleep. */
async function lessonPage(b, lesson, { w, h, dsf, mobile }) {
  const slot = `rc${lesson}${Date.now() % 1e6}`, p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w, h, dsf, mobile });
  const ready = `location.protocol==='http:' && document.readyState==='complete' && !window.__old && !!document.querySelector('button[data-act="academy"]')`;
  await until(p, ready, 'the title screen', 90000);
  const done = IDS.slice(0, IDS.indexOf(lesson));
  if (done.length) { await p.eval(`localStorage.setItem('pc.academy.${slot}', ${JSON.stringify(JSON.stringify(done))}); window.__old = 1; location.reload()`); await sleep(300); await until(p, ready, 'the title screen again', 90000); }
  await p.eval(`document.querySelector('button[data-act="academy"]').click()`); await until(p, `!!document.querySelector('[data-act="ac-start"]')`, 'the lesson\'s first card');
  await p.eval(`document.querySelector('[data-act="ac-start"]').click()`); await until(p, `!!document.querySelector('.ac-coach')`, 'the coach card');
  await p.eval(`(()=>{ const o = performance.now.bind(performance); window.__skew = 0; performance.now = () => o() + window.__skew; })()`); // the hint's clock
  return p;
}
const stepOf = (p) => p.eval(`(/STEP (\\d+) OF (\\d+)/i.exec((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'')||[]).slice(1,3).map(Number)`);
const stepIs = (n) => `/STEP ${n} OF/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'') || !!document.querySelector('.ac-sheet')`;
const atStep = (p, n) => until(p, `/STEP ${n} OF/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'') || !!document.querySelector('.ac-sheet')`, `lesson step ${n}`);
const FIND = (sel, re, nth) => `(()=>{ const d=document.querySelector('dialog#dlg'), root=d.open?d:document; const all=[...root.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&!e.closest('.ac-coach')}).filter(e=>new RegExp(${JSON.stringify(re)},'i').test((e.getAttribute('aria-label')||e.textContent).trim())); return all[${nth || 0}]||null })()`;
const SNAP = `(()=>{ const e=window.__t, card=document.querySelector('.ac-coach'); if(!e||!e.isConnected||!card) return null; const r=e.getBoundingClientRect(), c=card.getBoundingClientRect(); return [r.x,r.y,r.width,r.height,c.x,c.y,c.width,c.height].map(Math.round).join() })()`;
/** What a finger does with the room's sheet: scrolls it until the control is in the middle of the part that can be seen (above the sticky foot), or only just in view; elsewhere the browser's own scrollIntoView. */
const BRING = (way) => `(()=>{ const e=window.__t, d=document.querySelector('dialog#dlg'), STICKY='.deal-dock, .deal-foot, .deal-result > .row:last-child';
  if(!d.open||!d.contains(e)) { e.scrollIntoView({ block: ${JSON.stringify(way)}, inline: 'nearest' }); return; } if (e.closest(STICKY)) return;
  const dr=d.getBoundingClientRect(), foots=[...d.querySelectorAll(STICKY)].filter(f=>f.getBoundingClientRect().height>0), top=dr.top, bottom=foots.length?Math.min(...foots.map(f=>f.getBoundingClientRect().top)):dr.bottom, r=e.getBoundingClientRect();
  if (${JSON.stringify(way)}==='center') d.scrollTop += (r.top + r.height/2) - (top + bottom)/2; else if (r.top < top + 8) d.scrollTop += r.top - top - 8; else if (r.bottom > bottom - 8) d.scrollTop += r.bottom - bottom + 8; })()`;
const MEASURE = `(()=>{ const e=window.__t, card=document.querySelector('.ac-coach'), r=e.getBoundingClientRect(), c=card.getBoundingClientRect();
  const ox=Math.max(0,Math.min(r.right,c.right)-Math.max(r.left,c.left)), oy=Math.max(0,Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top)), cx=r.x+r.width/2, cy=r.y+r.height/2;
  const inV=cx>=0&&cy>=0&&cx<=innerWidth&&cy<=innerHeight, h=inV?document.elementFromPoint(cx,cy):null;
  // is there any place in the window, as big as the folded tab, that is clear of every control? (a 6px grid; the sheet's controls are cut to the sheet, as the card's own count of them is)
  const d=document.querySelector('dialog#dlg'), root=d.open?d:document, box=d.open?d.getBoundingClientRect():{left:0,top:0,right:innerWidth,bottom:innerHeight}, hw=card.classList.contains('handle')?c.width:123, hh=card.classList.contains('handle')?c.height:44;
  const ctl=[...root.querySelectorAll('button, a[href], input, select, textarea, summary, [role="button"]')].filter(x=>!card.contains(x)).map(x=>x.getBoundingClientRect()).map(q=>({x:Math.max(q.left,box.left),y:Math.max(q.top,box.top),w:Math.min(q.right,box.right)-Math.max(q.left,box.left),h:Math.min(q.bottom,box.bottom)-Math.max(q.top,box.top)})).filter(q=>q.w>0&&q.h>0);
  let room=false; for(let y=8;y<=innerHeight-hh-8&&!room;y+=6) for(let x=8;x<=innerWidth-hw-8&&!room;x+=6) if(!ctl.some(q=>x<q.x+q.w&&x+hw>q.x&&y<q.y+q.h&&y+hh>q.y)) room=true;
  return { cx, cy, inV, room, cover: ox*oy/(r.width*r.height), lands: !!h&&(e===h||e.contains(h)), byCard: !!h&&card.contains(h), shape: card.className.replace('ac-coach ','').replace('lift','').trim()||'full', text: (e.getAttribute('aria-label')||e.textContent).replace(/\\s+/g,' ').trim().slice(0,30), hit: h ? h.tagName+'.'+String(h.className).slice(0,40) : 'nothing', box: [r.x,r.y,r.width,r.height,c.x,c.y,c.width,c.height].map(Math.round).join() } })()`;
/** A page's taps: bring the control into view, let the card settle, assert it is clear of the control and that a tap lands on it, and (tap) press it with the real mouse. */
function taps(p, log, label) {
  const find = async (sel, re, nth) => { await until(p, `(window.__t = ${FIND(sel, re, nth)}) && true`, `${sel} ${re}`); };
  const settle = async () => { let last = '', same = 0; const end = Date.now() + 8000; while (Date.now() < end && same < 3) { const s = await p.eval(SNAP); same = s === last ? same + 1 : 0; last = s; await p.sleep(160); } };
  const check = async (sel, re, { scroll = 'center', nth = 0 } = {}) => {
    await find(sel, re, nth);
    let m;
    for (let i = 0; i < 4; i++) { // a finger scrolls again when the sheet is not where it left it (the room repaints and keeps its own place)
      if (scroll !== 'none') await p.eval(BRING(scroll)); await p.sleep(450); await settle(); m = await p.eval(MEASURE);
      if (m.lands || m.byCard) break;
    }
    const where = `${label}, ${m.text} (${scroll}), card ${m.shape}`;
    log.push({ where, cover: m.cover, lands: m.lands, shape: m.shape, room: m.room });
    assert.ok(m.inV, `${where}: the middle of the control is in the window`);
    assert.ok(m.lands && !m.byCard, `${where}: a tap at the middle lands on the control${m.byCard ? ' (it lands on the card)' : ` (it lands on ${m.hit}; control and card ${m.box})`}`);
    // the card covers none of the control, unless the sheet is nothing but buttons at this position of it (no place in the window, even for the tab, is clear of them): then some button is covered, and a tap at the middle still lands
    assert.ok(m.cover === 0 || (!m.room && m.cover <= 0.5), `${where}: the card covers ${Math.round(m.cover * 100)}% of the control${m.room ? ' though a place for the tab is clear of every control' : ''}`);
    return m;
  };
  // `then` (an expression) is what the press should bring about; a press the page has not answered in 6 seconds is made again (the page repaints between measuring and pressing, and a loaded machine is slow), up to 3 times
  const tap = async (sel, re, o = {}) => {
    for (let i = 0; ; i++) {
      const m = await check(sel, re, o); await p.click(m.cx, m.cy);
      if (!o.then) return m;
      const end = Date.now() + 6000; let ok = false; while (Date.now() < end && !ok) { try { ok = !!(await p.eval(o.then)); } catch { /* between screens */ } if (!ok) await p.sleep(150); }
      if (ok) return m;
      assert.ok(i < 2, `${label}: pressing ${sel} ${re} brought nothing about (${o.then})`);
    }
  };
  const press = async (sel, re, o = {}) => { await find(sel, re, o.nth || 0); await p.eval(BRING('center')); await p.sleep(300); const m = await p.eval(`(()=>{ const e=window.__t, r=e.getBoundingClientRect(), cx=r.x+r.width/2, cy=r.y+r.height/2, h=document.elementFromPoint(cx,cy); return { cx, cy, lands: !!h&&(e===h||e.contains(h)) } })()`); assert.ok(m.lands, `${label}: ${sel} ${re}: a tap at the middle lands on it`); await p.click(m.cx, m.cy); }; // the lesson is won and its card gone: the room's own button
  const hint = async () => { await p.eval(`window.__skew += 30000`); await until(p, `!!document.querySelector('.ac-coach .ac-hint, .ac-coach.handle .ac-grab')`, 'the hint'); await p.sleep(500); };
  return { check, tap, press, hint, find };
}
const dealOpen = async (p, stage) => {
  await until(p, `document.querySelector('dialog#dlg').open && !!document.querySelector('#dlg .deal')`, `the Deal Room (the dialog says: ${await p.eval(`(document.querySelector('dialog#dlg').open ? 'open: ' : 'closed: ') + document.querySelector('dialog#dlg').innerText.replace(/\\s+/g,' ').slice(0,120)`)}; the page: ${await p.eval(`(document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText`)})`);
  if (stage) await until(p, `document.querySelector('#dlg .deal') && document.querySelector('#dlg .deal').dataset.stage===${JSON.stringify(stage)}`, `the Deal Room at ${stage} (it is at ${await p.eval(`(document.querySelector('#dlg .deal')||{dataset:{}}).dataset.stage + ': ' + ((document.querySelector('#dlg .deal-top')||{}).innerText||'').replace(/\\s+/g,' ').slice(0,80)`)})`);
};
const DEAL = `document.querySelector('dialog#dlg').open && !!document.querySelector('#dlg .deal')`;
const stageIs = (stage) => `${DEAL} && document.querySelector('#dlg .deal').dataset.stage===${JSON.stringify(stage)}`;
const GONE = `!document.querySelector('dialog#dlg').open`;
const gone = (p) => until(p, `!document.querySelector('dialog#dlg').open`, 'the Deal Room closed');
/** Both ways of scrolling a control into view are tried: the middle of the sheet, and only just in view (what a keyboard does). */
const WAYS = ['center', 'nearest'];

const SUITE = { skip: !BROWSER, timeout: 400000 };
/** RC_REPORT=1 prints what each lesson's taps measured, by size: how many controls, the most any card covered of one, the shapes the card took and the taps made where the sheet was all buttons. */
function report(name, log) {
  if (!process.env.RC_REPORT) return;
  for (const size of SIZES.map((z) => `${z.w}x${z.h}`)) {
    const l = log.filter((x) => x.where.includes(` ${size},`)), shapes = {};
    for (const x of l) shapes[x.shape] = (shapes[x.shape] || 0) + 1;
    console.log(`RC ${name} ${size}: ${l.length} controls checked, every tap landed: ${l.every((x) => x.lands)}, most covered of one control: ${Math.round(Math.max(0, ...l.map((x) => x.cover)) * 100)}%, covered at all: ${l.filter((x) => x.cover > 0).length} (all with no clear place: ${l.filter((x) => x.cover > 0).every((x) => !x.room)}), shapes ${JSON.stringify(shapes)}`);
  }
}

test('browser, lesson 2 (Read the Room): "Check the serial", then "Done reading" and "Pass on this lot", with the hint and without, are never under the card', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm02', sz), t = taps(p, log, `m02 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-codex"]', '.', { then: stepIs(2) }); await atStep(p, 2); await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(3) }); await atStep(p, 3);
      await t.tap('[data-act="market-tab"]', '^Lots'); await t.tap('[data-act="market-look"]', '.', { nth: 1, then: stageIs('read') }); await dealOpen(p, 'read'); // the lots: the baseball, then the first watch (the fake), then the second
      for (const way of WAYS) { await t.check('button[data-deal="probe"]', 'Check the serial', { scroll: way }); await t.check('button', '^Done reading', { scroll: way }); await t.check('button', '^Pass on this lot', { scroll: way }); }
      await t.tap('button[data-deal="probe"]', 'Check the serial');
      await t.hint();
      for (const way of WAYS) { await t.check('button', '^Done reading', { scroll: way }); await t.check('button', '^Pass on this lot', { scroll: way }); }
      await t.tap('button', '^Pass on this lot'); await t.tap('dialog#dlg button', '^Continue$', { then: GONE }); await gone(p); await atStep(p, 4); // the first watch was a fake: the lesson goes on
    } finally { await p.close(); }
  }
  report('m02', log);
  assert.ok(log.length > 40, `${log.length} taps checked`);
});

test('browser, lesson 3 (Know Your Buyer): the Scarcity and Prestige angles and "Pitch Scarcity and Prestige" are never under the card', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm03', sz), t = taps(p, log, `m03 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(2) }); await atStep(p, 2);
      await t.tap('[data-act=\"market-sell\"]', 'Bree', { then: stageIs('pitch') }); await dealOpen(p, 'pitch');
      for (const way of WAYS) for (const a of ['Prestige', 'Utility', 'Scarcity', 'Price', 'Story']) await t.check('button[data-deal="angle"]', a, { scroll: way });
      await t.hint();
      for (const way of WAYS) for (const a of ['Prestige', 'Scarcity']) await t.check('button[data-deal="angle"]', a, { scroll: way });
      await t.tap('button[data-deal="angle"]', 'Scarcity'); await t.tap('button[data-deal="angle"]', 'Prestige');
      await t.tap('button[data-deal="pitch-go"]', '^Pitch Scarcity and Prestige'); await until(p, `!!document.querySelector('#dlg [data-deal="next"]')`, 'the Close is next');
      await t.tap('button[data-deal="next"]', '^Continue$'); await dealOpen(p, 'close');
      for (const way of WAYS) for (const a of ['Aim high', 'Fair', 'Quick sale']) await t.check('button[data-deal="anchor"]', a, { scroll: way });
      await t.check('button[data-deal="walk"]', 'Walk away'); await t.tap('button[data-deal="anchor"]', 'Aim high');
    } finally { await p.close(); }
  }
  report('m03', log);
  assert.ok(log.length > 80, `${log.length} taps checked`);
});

test('browser, lesson 4 (Haggle 101): "Aim high", "Hold", "Come down" and "Accept their offer" are never under the card, the careless way and the careful way', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm04', sz), t = taps(p, log, `m04 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(2) }); await atStep(p, 2);
      // the careless deal: Quick for the Pitch, then Fair
      await t.tap('[data-act=\"market-sell\"]', 'Abernathy', { then: stageIs('pitch') }); await dealOpen(p, 'pitch');
      await t.tap('button[data-deal="quick-stage"]', '^Quick: auto-play'); await t.tap('button[data-deal="next"]', '^Continue$'); await dealOpen(p, 'close');
      await t.tap('button[data-deal="anchor"]', 'Fair');
      for (let i = 0; i < 6 && !(await p.eval(`!!document.querySelector('#dlg [data-deal="finish"]')`)); i++) { await t.tap('button[data-deal="accept"]', 'Accept their offer'); await p.sleep(300); }
      await t.tap('button[data-deal="finish"]', '^See the result'); await t.tap('dialog#dlg button', '^Continue$', { then: GONE }); await gone(p); await atStep(p, 3);
      // the careful deal: Aim high, Hold, Come down small, then accept
      await t.tap('[data-act=\"market-sell\"]', 'Dolores', { then: stageIs('pitch') }); await dealOpen(p, 'pitch');
      await t.tap('button[data-deal="quick-stage"]', '^Quick: auto-play'); await t.tap('button[data-deal="next"]', '^Continue$'); await dealOpen(p, 'close');
      for (const way of WAYS) for (const a of ['Aim high', 'Fair', 'Quick sale']) await t.check('button[data-deal="anchor"]', a, { scroll: way });
      await t.hint();
      for (const way of WAYS) for (const a of ['Aim high', 'Walk away']) await t.check('button', a, { scroll: way });
      await t.tap('button[data-deal="anchor"]', 'Aim high'); await p.sleep(600);
      for (const way of WAYS) for (const a of ['Hold', 'Come down', 'Accept their offer']) if (!(await p.eval(`!!document.querySelector('#dlg [data-deal="finish"]')`))) await t.check('button', a, { scroll: way });
      for (let i = 0; i < 6 && !(await p.eval(`!!document.querySelector('#dlg [data-deal="finish"]')`)); i++) { await t.tap('button[data-deal="accept"]', 'Accept their offer'); await p.sleep(300); }
    } finally { await p.close(); }
  }
  report('m04', log);
  assert.ok(log.length > 80, `${log.length} taps checked`);
});

test('browser, lesson 5 (Fix It): "Careful: pay more, no timing" and Stop are never under the card', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm05', sz), t = taps(p, log, `m05 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-quests"]', '.', { then: stepIs(2) }); await atStep(p, 2); await t.tap('[data-anchor="dock-stock"]', '.', { then: stepIs(3) }); await atStep(p, 3);
      await t.tap('[data-act="stock-repair"]', '.'); await dealOpen(p, 'fix');
      for (const way of WAYS) { await t.check('button[data-deal="careful"]', '^Careful', { scroll: way }); await t.check('button[data-deal="stop"]', '^Stop', { scroll: way }); }
      await t.hint();
      for (const way of WAYS) await t.check('button[data-deal="careful"]', '^Careful', { scroll: way });
      await t.tap('button[data-deal="careful"]', '^Careful'); await p.sleep(500);
    } finally { await p.close(); }
  }
  report('m05', log);
  assert.ok(log.length > 20, `${log.length} taps checked`);
});

test('browser, lesson 10 (Deal Day): "Check the serial", "Done reading", "Pass on this lot" and "Bid" are never under the card, with the hint and without', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm10', sz), t = taps(p, log, `m10 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-market"]', '.');
      await t.tap('[data-act="market-tab"]', '^Lots'); await t.tap('[data-act="market-look"]', '.', { then: stageIs('read') }); await dealOpen(p, 'read');
      for (const way of WAYS) { await t.check('button[data-deal="probe"]', 'Check the serial', { scroll: way }); await t.check('button', '^Done reading', { scroll: way }); await t.check('button', '^Pass on this lot', { scroll: way }); }
      await t.tap('button[data-deal="probe"]', 'Check the serial'); await t.hint();
      for (const way of WAYS) { await t.check('button', '^Done reading', { scroll: way }); await t.check('button', '^Pass on this lot', { scroll: way }); }
      await t.tap('button', '^Done reading'); await t.tap('button[data-deal="next"]', '^Continue$'); await dealOpen(p, 'bid');
      for (const way of WAYS) { await t.check('button[data-deal="bid"]', '^(Bid|Open the bidding)', { scroll: way }); await t.check('button[data-deal="drop"]', '^Drop out', { scroll: way }); }
      await t.hint();
      for (const way of WAYS) { await t.check('button[data-deal="bid"]', '^(Bid|Open the bidding)', { scroll: way }); await t.check('button[data-deal="drop"]', '^Drop out', { scroll: way }); }
      await t.tap('button[data-deal="bid"]', '^(Bid|Open the bidding)'); await p.sleep(400);
    } finally { await p.close(); }
  }
  report('m10', log);
  assert.ok(log.length > 60, `${log.length} taps checked`);
});

// ------------------------------------------------------------------------------------------------------------------------------------
// the lessons that do not live in a Deal Room, and the Deal Rooms they do reach: nothing that worked before stopped working
// ------------------------------------------------------------------------------------------------------------------------------------
const CLOCK = '[data-act="pause"]'; // the Play / Pause button: it is the one the clock's anchor means
const closeCash = async (p) => { await until(p, `document.querySelector('dialog#dlg').open`, 'the Cash breakdown'); await p.key('Escape', { wait: 400 }); await until(p, `!document.querySelector('dialog#dlg').open`, 'the breakdown closed'); };

test('browser, lesson 1 (First Swap): the HUD, the dock and the Deal Room\'s Quick deal are never under the card, and the lesson is won', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm01', sz), t = taps(p, log, `m01 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="hud-cash"]', '.'); await closeCash(p); await atStep(p, 2);
      await t.tap('[data-anchor="dock-stock"]', '.', { then: stepIs(3) }); await atStep(p, 3); await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(4) }); await atStep(p, 4);
      await t.tap('[data-act=\"market-sell\"]', 'Wen', { then: stageIs('pitch') }); await dealOpen(p, 'pitch');
      await t.check('button[data-deal="quick-stage"]', '^Quick: auto-play'); await t.tap('button[data-deal="quick-all"]', '^Quick deal$');
      await t.press('dialog#dlg button', '^Continue$'); await gone(p); // the sale is the lesson's last step: it is won, and its card is gone
      await until(p, `!!document.querySelector('.ac-sheet')`, 'the lesson won');
    } finally { await p.close(); }
  }
  report('m01', log);
  assert.ok(log.length >= 15, `${log.length} taps checked`);
});

test('browser, lesson 6 (Cash Is Not Sleeping): the HUD, the dock and the Crew drawer\'s Hire button are never under the card, and the card still follows into the hire dialog', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm06', sz), t = taps(p, log, `m06 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="hud-cash"]', '.'); await closeCash(p); await atStep(p, 2);
      await t.tap('[data-anchor="dock-crew"]', '.', { then: stepIs(3) }); await atStep(p, 3);
      await t.tap('[data-act="crew-hire"]', '.'); await until(p, `document.querySelector('dialog#dlg').open && !!document.querySelector('dialog#dlg [data-anchor="hire-go"]')`, 'the hire dialog');
      // the hire dialog is not a Deal Room: it is as it was (the card hops into it and says what to press); what it covers there is another track's
      assert.ok(await p.eval(`document.querySelector('dialog#dlg').contains(document.querySelector('.ac-coach'))`), `${sz.w}x${sz.h}: the card is in the hire dialog, where it can be read`);
      assert.ok(await p.eval(`!!document.querySelector('.ac-coach .ac-say').textContent.trim()`), 'with its words');
      await p.key('Escape', { wait: 500 });
    } finally { await p.close(); }
  }
  report('m06', log);
  assert.ok(log.length >= 9, `${log.length} taps checked`);
});

test('browser, lesson 7 (Other People\'s Money): the Bank, the Deal Room\'s Quick deal, the clock and the dock are never under the card', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm07', sz), t = taps(p, log, `m07 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-bank"]', '.', { then: stepIs(2) }); await atStep(p, 2);
      await p.eval(`(()=>{const i=document.querySelector('[data-anchor="drawer"] input[type=range]'); i.scrollIntoView({block:'center'}); i.focus();})()`);
      for (let k = 0; k < 3; k++) await p.key('ArrowRight', { wait: 120 });
      await t.tap('[data-act="bank-draw"]', '.'); await atStep(p, 3);
      await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(4) }); await atStep(p, 4);
      await t.tap('[data-act="market-tab"]', '^Lots'); await t.tap('[data-act="market-look"]', '.', { then: stageIs('read') }); await dealOpen(p, 'read');
      await t.tap('button[data-deal="quick-all"]', '^Quick deal$'); await t.tap('dialog#dlg button', '^Continue$', { then: GONE }); await gone(p); await atStep(p, 5);
      await t.tap(CLOCK, '.'); await atStep(p, 6); // the glut lands about 3 seconds later, and the lesson stops the clock itself
      await atStep(p, 7);
      if (await p.eval(`document.querySelector('dialog#dlg').open`)) await p.key('Escape', { wait: 400 });
      await t.tap('[data-anchor="dock-bank"]', '.');
    } finally { await p.close(); }
  }
  report('m07', log);
  assert.ok(log.length >= 24, `${log.length} taps checked`);
});

test('browser, lesson 8 (Don\'t Follow the Herd): the Market cards and the Deal Room\'s Quick deal are never under the card, and the lesson is won', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm08', sz), t = taps(p, log, `m08 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(2) }); await atStep(p, 2);
      await t.tap('[data-act=\"market-sell\"]', 'Loft', { then: stageIs('pitch') }); await dealOpen(p, 'pitch'); await t.tap('button[data-deal="quick-all"]', '^Quick deal$'); await t.tap('dialog#dlg button', '^Continue$', { then: GONE }); await gone(p); await atStep(p, 3);
      await t.tap('[data-act=\"market-sell\"]', 'pop-?up|stall', { then: stageIs('pitch') }); await dealOpen(p, 'pitch'); await t.tap('button[data-deal="quick-all"]', '^Quick deal$'); await t.press('dialog#dlg button', '^Continue$'); await gone(p);
      await until(p, `!!document.querySelector('.ac-sheet')`, 'the lesson won');
    } finally { await p.close(); }
  }
  report('m08', log);
  assert.ok(log.length >= 18, `${log.length} taps checked`);
});

test('browser, lesson 9 (Storm Warning): the dock, the clock and the ticker are never under the card', SUITE, async () => {
  const b = await browser(), log = [];
  for (const sz of SIZES) {
    const p = await lessonPage(b, 'm09', sz), t = taps(p, log, `m09 ${sz.w}x${sz.h}`);
    try {
      await t.tap('[data-anchor="dock-stock"]', '.', { then: stepIs(2) }); await atStep(p, 2); await t.tap('[data-anchor="dock-travel"]', '.', { then: stepIs(3) }); await atStep(p, 3);
      await t.tap(CLOCK, '.'); await atStep(p, 4);
      await t.check('[data-anchor="dock-stock"]', '.'); await t.check('[data-anchor="dock-travel"]', '.');
    } finally { await p.close(); }
  }
  report('m09', log);
  assert.ok(log.length >= 15, `${log.length} taps checked`);
});

// ------------------------------------------------------------------------------------------------------------------------------------
// the folded card, used and read
// ------------------------------------------------------------------------------------------------------------------------------------

test('browser, the folded card: a real tap or the keyboard opens it, Fold away or a press elsewhere puts it back, and its words stay in the page for a screen reader', SUITE, async () => {
  const b = await browser(), p = await lessonPage(b, 'm03', SIZES[2]), log = [], t = taps(p, log, 'm03 folded');
  try {
    await t.tap('[data-anchor="dock-market"]', '.', { then: stepIs(2) }); await atStep(p, 2); await t.tap('[data-act=\"market-sell\"]', 'Bree', { then: stageIs('pitch') }); await dealOpen(p, 'pitch');
    const shape = () => p.eval(`(()=>{ const c=document.querySelector('.ac-coach'); return c.classList.contains('handle') ? 'handle' : 'card' })()`);
    // the sheet is scrolled until the angles fill it: no card stands clear of them, so the card is its tab
    let folded = false;
    for (let st = 0; st <= 1200 && !folded; st += 40) { await p.eval(`document.querySelector('dialog#dlg').scrollTop = ${st}`); await p.sleep(420); folded = (await shape()) === 'handle'; }
    assert.ok(folded, 'the Pitch stage at 640x360 has a position where the card is folded to its tab');
    await p.sleep(400);
    const say = await p.eval(`(()=>{ const s=document.querySelector('.ac-coach .ac-say'), cs=getComputedStyle(s), r=s.getBoundingClientRect(); return { text: s.textContent, display: cs.display, visibility: cs.visibility, w: r.width, h: r.height, inTree: !s.closest('[hidden], [aria-hidden="true"], [inert]'), label: document.querySelector('.ac-coach').getAttribute('aria-labelledby') } })()`);
    assert.ok(/Bree/.test(say.text), 'the words are in the page');
    assert.ok(say.display !== 'none' && say.visibility !== 'hidden' && say.inTree, `and not hidden from the accessibility tree (display ${say.display}, visibility ${say.visibility})`);
    assert.ok(say.w <= 2 && say.h <= 2, 'they are clipped to a pixel, not drawn over the room');
    assert.equal(say.label, 'ac-say', 'and the card is still named by them');
    const tab = await p.eval(`(()=>{ const g=document.querySelector('.ac-coach .ac-grab'), r=g.getBoundingClientRect(); return { name: g.getAttribute('aria-label'), expanded: g.getAttribute('aria-expanded'), h: r.height, w: r.width, cx: r.x + r.width/2, cy: r.y + r.height/2, tag: g.tagName, lands: document.elementFromPoint(r.x + r.width/2, r.y + r.height/2) === g } })()`);
    assert.equal(tab.tag, 'BUTTON'); assert.match(tab.name, /^Lesson card, step 2 of 3\. Open it to read\.$/); assert.equal(tab.expanded, 'false'); assert.ok(tab.h >= 36 && tab.lands, `the tab is a button a thumb can hit (${Math.round(tab.w)}x${Math.round(tab.h)})`);
    assert.match(await p.eval(`document.querySelector('#live').textContent`), /The lesson card is folded to a tab so it does not cover the buttons\. Press C, then Enter, to open it\./, 'the fold was announced');
    // the keyboard: C reaches the tab, Enter opens the card, and the cursor is on Fold away
    await p.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.querySelector('dialog#dlg').focus()`);
    await p.key('c', { wait: 200 });
    assert.equal(await p.eval(`document.activeElement && document.activeElement.dataset.act`), 'ac-expand', 'C jumps to the tab');
    await p.key('Enter', { wait: 700 });
    const open = await p.eval(`(()=>{ const c=document.querySelector('.ac-coach'), s=c.querySelector('.ac-say'), r=s.getBoundingClientRect(), f=c.querySelector('[data-act="ac-fold"]'); return { handle: c.classList.contains('handle'), sayH: r.height, fold: !!f, focus: document.activeElement === f, pressed: f && f.getAttribute('aria-expanded') } })()`);
    assert.equal(open.handle, false, 'Enter opens the card'); assert.ok(open.sayH > 20, 'with its words showing'); assert.ok(open.fold && open.focus && open.pressed === 'true', 'and the cursor is on Fold away');
    await p.sleep(600); assert.equal(await shape(), 'card', 'it stays open while the player reads');
    await p.key('Enter', { wait: 700 });
    const back = await p.eval(`(()=>{ const c=document.querySelector('.ac-coach'); return { handle: c.classList.contains('handle'), focus: document.activeElement && document.activeElement.dataset.act } })()`);
    assert.equal(back.handle, true, 'Fold away folds it'); assert.equal(back.focus, 'ac-expand', 'and the cursor is on the tab again');
    // a real tap on the tab opens it; a press anywhere else in the room puts it away
    const c0 = await p.eval(`(()=>{ const r=document.querySelector('.ac-coach .ac-grab').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`);
    await p.click(c0.x, c0.y); await p.sleep(600);
    assert.equal(await shape(), 'card', 'a tap on the tab opens the card');
    await p.eval(`document.querySelector('dialog#dlg h2, dialog#dlg h3').click()`); await p.sleep(600);
    assert.equal(await shape(), 'handle', 'a press elsewhere folds it away again');
  } finally { await p.close(); }
});
