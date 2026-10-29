// The Academy's coach card, in a browser: the cut-down matrix and the two faults the browser audit found by hand (docs/ARCHITECTURE.md, "The card has its own place").
//   M1  the matrix (scripts/academy-sweep.mjs), two sizes by four lessons: every lesson step, in every state the player can put the game in (no panel, each panel, each Deal Room stage, the hire dialog), as the card
//       arrives and with the 20-second hint, with a mouse and with a finger: no card covers a control, the step's words and the hint are on the screen or one tap away in a named tab, every button of the card is
//       there and takes a tap. The full matrix is `node scripts/academy-sweep.mjs --level full`.
//   M3  the largest text at the shortest windows (844x390 with a finger and 640x360 with a mouse, lessons 1 and 4): the card the player opens from its tab shows its words AND its hint, in the wide shape where the full
//       card is taller than the window (the full card's hint was 42% on the screen, the rest behind the card's own scroll)
//   M2  the sweep sees what it is there to see: a card put over the dock is reported as covering it (an instrument that cannot fail proves nothing).
//   PB-1  with a panel open a real tap at the middle of its Close button lands on the Close button and closes the panel, not on the card (768x1024, 640x360, 360x640).
//   PB-3  with a panel open and the hint due the player can read the words and the hint: on the card, or by a tap on the tab that says Hint (640x360, lesson 10, Market).
// Chrome is needed (skipped without it, or with PC_NO_BROWSER=1). Run: node --test tests/academy-matrix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER, browser, lessonPage, tapAt, atStep, hint, until, closePage, sleep, closeCash } from './helpers/lessonpage.mjs';
import { judge, sweepLesson, startEnv, SIZES, lessonPage as sweepPage } from '../scripts/academy-sweep.mjs';

let shared = null;
const getBrowser = async () => (shared ||= await browser());
test.after(async () => { if (shared) await shared.close(); });
const SUITE = { skip: !BROWSER && 'no Chrome here (or PC_NO_BROWSER=1)', timeout: 900000 };
const size = (id) => SIZES.find((s) => s.id === id);
const phone = (id, touch) => ({ ...size(id), name: id, mobile: touch, touch });

test('M1: the cut-down matrix, 360x640 with a finger and 640x360 with a mouse by lessons 1, 5, 6 and 10: no card covers a control, and every card says what the step says or is a tab that opens it', SUITE, async () => {
  const env = await startEnv();
  try {
    const rows = [];
    for (const [id, mode] of [['360x640', 'touch'], ['640x360', 'mouse']]) for (const lesson of ['m01', 'm05', 'm06', 'm10']) rows.push(...await sweepLesson(env, lesson, size(id), mode, { level: 'quick' }));
    assert.ok(rows.length > 400, `the sweep measured ${rows.length} cells`);
    assert.ok(rows.some((r) => /^drawer:/.test(r.state)) && rows.some((r) => /^deal:/.test(r.state)) && rows.some((r) => r.state === 'hire') && rows.some((r) => /^hint/.test(r.variant)), 'drawers, a Deal Room, the hire dialog and the hint were all visited');
    const bad = rows.filter((r) => r.faults.length);
    assert.equal(bad.length, 0, `${bad.length} of ${rows.length} cells have a fault:\n` + bad.slice(0, 12).map((r) => `  ${r.lesson} ${r.size} ${r.mode} step ${r.step + 1} ${r.state} [${r.variant}] ${r.shape}: ${r.faults.map((f) => `${f.type} (${f.detail})`).join('; ')}`).join('\n'));
  } finally { await env.close(); }
});

test('M3: at the largest text size in a short window the card the player opens shows all of its words and its hint, across the strip\'s width where it must (lessons 1 and 4, 844x390 and 640x360)', SUITE, async () => {
  const env = await startEnv();
  try {
    const rows = [];
    for (const [id, mode] of [['844x390', 'touch'], ['640x360', 'mouse']]) for (const lesson of ['m01', 'm04']) rows.push(...await sweepLesson(env, lesson, size(id), mode, { level: 'std', states: ['plain'], variants: ['xl'] }));
    const open = rows.filter((r) => r.variant === 'xl+open');
    assert.ok(open.length >= 4, `the card was opened from its tab in ${open.length} cells`);
    const bad = rows.filter((r) => r.faults.length);
    assert.equal(bad.length, 0, `${bad.length} of ${rows.length} cells have a fault:\n` + bad.slice(0, 12).map((r) => `  ${r.lesson} ${r.size} ${r.mode} step ${r.step + 1} ${r.state} [${r.variant}] ${r.shape}: ${r.faults.map((f) => `${f.type} (${f.detail})`).join(', ')}`).join('\n'));
    assert.ok(open.some((r) => /\bwide\b/.test(r.shape)), `the wide shape was used where the full card is taller than the window (${[...new Set(open.map((r) => r.shape))].join(', ')})`);
  } finally { await env.close(); }
});

test('M2: the sweep reports a card put over the dock as covering it, and a folded card with no tab in it as unreachable', SUITE, async () => {
  const env = await startEnv();
  try {
    const q = await sweepPage(env, 'm01', size('360x640'), 'touch');
    try {
      const before = await q.eval(`__sw.measure(__ac, { state: 'plain', step: 0, variant: 'base' })`);
      assert.deepEqual(judge(before), [], 'the card where the placer put it is clean');
      const dock = await q.eval(`(() => { const r = document.querySelector('.dock').getBoundingClientRect(); return { x: r.x + 4, y: r.y + 4 }; })()`);
      await q.eval(`(() => { __ac.card().style.transform = 'translate(${dock.x}px, ${dock.y}px)'; })()`); // the card moved by hand onto the dock
      const over = judge(await q.eval(`__sw.measure(__ac, { state: 'plain', step: 0, variant: 'base' })`)).map((f) => f.type);
      assert.ok(over.includes('covers-dock'), `a card standing on the dock is reported (${over.join(', ') || 'nothing'})`);
      await q.eval(`(() => { const c = __ac.card(); c.querySelector('.ac-grab')?.remove(); c.classList.add('handle'); })()`); // a card that says it is folded and has no tab
      const none = judge(await q.eval(`__sw.measure(__ac, { state: 'plain', step: 0, variant: 'base' })`)).map((f) => f.type);
      assert.ok(none.includes('tab-unnamed') || none.includes('words-hidden'), `a folded card with no tab is reported (${none.join(', ') || 'nothing'})`);
    } finally { await closePage(q); }
  } finally { await env.close(); }
});

/** A real tap at the middle of one of the card's own buttons (the page helpers leave the card out of what they look for). */
const tapCard = async (p, sel) => {
  const m = await p.eval(`(()=>{ const e=document.querySelector(${JSON.stringify(sel)}); if(!e||!e.getClientRects().length) return null; const b=e.getBoundingClientRect(), x=b.x+b.width/2, y=b.y+b.height/2, h=document.elementFromPoint(x,y); return { x, y, lands: !!h&&(e===h||e.contains(h)) } })()`);
  assert.ok(m, `${sel} is on the screen`); assert.ok(m.lands, `a tap at the middle of ${sel} lands on it`);
  await p.click(m.x, m.y); await p.sleep(400);
};

const OPEN_AND_CLOSE = async (p, what, open) => {
  await open(p);
  const m = await tapAt(p, '[data-act="drawer-close"]');
  assert.ok(m.lands && m.during.lands, `${what}: a tap at the middle of the panel's Close button lands on the button, and while the finger is down (${m.hit} / ${m.during.hit})`);
  await until(p, `document.querySelector('#drawer').hidden`, `${what}: the panel closed by the tap`);
};

test('PB-1: with a panel open a real tap at the middle of its Close button lands on it and closes the panel (768x1024 lesson 1, 640x360 lesson 2, 360x640 lessons 1, 5 and 7)', SUITE, async () => {
  const br = await getBrowser();
  { // lesson 1 at a tablet held upright: the card stood over the Close button of the Market sheet
    const p = await lessonPage(br, 'm01', phone('768x1024', true));
    try {
      await OPEN_AND_CLOSE(p, '768x1024 lesson 1 step 4, Market', async () => {
        await tapAt(p, '[data-anchor="hud-cash"]'); await closeCash(p); await atStep(p, 2);
        await tapAt(p, '[data-anchor="dock-stock"]'); await atStep(p, 3); await tapAt(p, '[data-anchor="dock-market"]'); await atStep(p, 4);
      });
    } finally { await closePage(p); }
  }
  { // lesson 2 at a desktop window at 200%: the card stood over the Close of the Market panel
    const p = await lessonPage(br, 'm02', phone('640x360', false));
    try {
      await OPEN_AND_CLOSE(p, '640x360 lesson 2, Market', async () => { await tapAt(p, '[data-anchor="dock-codex"]'); await atStep(p, 2); await tapAt(p, '[data-anchor="dock-market"]'); await atStep(p, 3); });
    } finally { await closePage(p); }
  }
  for (const [lesson, dock, step] of [['m01', 'dock-stock', 2], ['m05', 'dock-quests', 2], ['m07', 'dock-bank', 2]]) { // the phone held upright: the card stood over the panel's title bar
    const p = await lessonPage(br, lesson, phone('360x640', true));
    try {
      await OPEN_AND_CLOSE(p, `360x640 ${lesson}, ${dock}`, async () => {
        if (lesson === 'm01') { await tapAt(p, '[data-anchor="hud-cash"]'); await closeCash(p); await atStep(p, 2); }
        await tapAt(p, `[data-anchor="${dock}"]`); await atStep(p, lesson === 'm01' ? 3 : step);
      });
    } finally { await closePage(p); }
  }
});

test('PB-3: with a panel open at 640x360 and the hint due (lesson 10, Market) the player can read the words and the hint: on the card, or one tap away in the tab that says Hint', SUITE, async () => {
  const br = await getBrowser(), p = await lessonPage(br, 'm10', phone('640x360', false));
  try {
    await tapAt(p, '[data-anchor="dock-market"]'); await p.sleep(500);
    await hint(p);
    const read = () => p.eval(`(()=>{ const c=document.querySelector('.ac-coach'), q=(s)=>{ const e=c.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return { w:r.width, h:r.height, top:r.top, bottom:r.bottom } }; const g=c.querySelector('.ac-grab'); return { handle:c.classList.contains('handle'), say:q('.ac-say'), hint:q('.ac-hint'), grab:g&&g.getClientRects().length?{ name:g.getAttribute('aria-label'), text:g.textContent.trim() }:null, vh:innerHeight } })()`);
    const shown = (x, vh) => !!x && x.w >= 24 && x.h >= 10 && x.top >= -0.5 && x.bottom <= vh + 0.5;
    let r = await read();
    if (!r.handle) { assert.ok(shown(r.say, r.vh) && shown(r.hint, r.vh), `the card is a card, and its words and its hint are on the screen: ${JSON.stringify(r)}`); return; }
    assert.ok(r.grab && /hint/i.test(`${r.grab.name} ${r.grab.text}`), `the card is a tab and the tab says Hint: ${JSON.stringify(r.grab)}`);
    await tapCard(p, '.ac-grab'); await p.sleep(500);
    r = await read();
    assert.equal(r.handle, false, 'a tap on the tab opens the card');
    assert.ok(shown(r.say, r.vh) && shown(r.hint, r.vh), `the opened card has the words and the hint on the screen: ${JSON.stringify(r)}`);
    await tapCard(p, '[data-act="ac-fold"]'); await p.sleep(500);
    assert.equal((await read()).handle, true, 'Fold away puts it back to its tab');
  } finally { await closePage(p); }
});
