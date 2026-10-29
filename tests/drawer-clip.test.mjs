// A panel (the dock's drawer) is a box that clips; its body is the one thing in it that scrolls.
// The drawer used to be `overflow: hidden`, which is still a scroll container: a screen-reader-only span at the end of the Market's list, placed absolutely against the drawer, made the drawer itself scrollable
// by 52px at 844x390, so a script's scrollIntoView (the Academy's Show me, a test's helper) and the browser's own focus scroll on a press could slide the panel's title bar and Close button out of sight above its edge
// and move the list under the finger between its press and its release: the tap landed beside the button and nothing happened (tests/rep-card.test.mjs lesson 8, at 844x390).
//   D1  the sheet says so: the drawer clips, and its body is the containing block of what is placed in it
//   D2  in a browser, at the three small windows: after each panel is opened and its last control is scrolled into view, the drawer itself has not moved (scrollTop 0, no overflow of its own), its title bar and Close
//       are still inside it, and a real press on a control of the list lands (the list does not move between the press and the release)
// Chrome is needed for D2 (skipped without it, or with PC_NO_BROWSER=1). Run: node --test tests/drawer-clip.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER, browser, closePage, sleep } from './helpers/lessonpage.mjs';
import { newGame } from '../scripts/boot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'css/shell.css'), 'utf8');

test('D1: the drawer clips and does not scroll, and its body is the containing block of what is placed in it', () => {
  const drawer = css.split('\n').find((l) => l.startsWith('.drawer {')), body = css.split('\n').find((l) => l.startsWith('.db {'));
  assert.match(drawer, /overflow: hidden; overflow: clip;/, 'a clipped box (hidden first, for a browser that does not know clip)');
  assert.match(body, /position: relative;/, 'the body is positioned: an absolutely placed span in a list no longer widens the panel\'s own scroll area');
  assert.match(body, /overflow: auto;/, 'and it is the one that scrolls');
});

const SIZES = [{ id: '844x390', w: 844, h: 390, dsf: 2, mobile: true }, { id: '360x640', w: 360, h: 640, dsf: 2, mobile: true }, { id: '640x360', w: 640, h: 360, dsf: 2, mobile: false }];

test('D2: in a browser the drawer never moves: scrolling its last control into view scrolls the list and nothing else, and a press on a control lands', { skip: !BROWSER && 'no Chrome here (D1 holds the sheet)', timeout: 600000 }, async () => {
  const b = await browser();
  try { for (const sz of SIZES) {
    const slot = `dc${sz.id}${Date.now() % 1e6}`, p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, sz);
    try {
      await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
      await newGame(p, { perks: 'trades,pro', days: 3 });
      const docks = await p.eval(`[...document.querySelectorAll('.dock [data-act="dock"]')].map((b) => b.dataset.d)`);
      assert.ok(docks.length >= 3, `${sz.id}: the dock has its panels (${docks.join(',')})`);
      for (const id of docks) {
        await p.eval(`document.querySelector('.dock [data-d="${id}"]').click()`); await sleep(500);
        const r = await p.eval(`(() => {
          const d = document.querySelector('#drawer'); if (d.hidden) return { hidden: true };
          const db = d.querySelector('.db'), last = [...db.querySelectorAll('button, a[href], input, select, summary, [tabindex="0"]')].filter((e) => e.getClientRects().length).pop();
          if (last) last.scrollIntoView({ block: 'center', inline: 'nearest' });
          const dr = d.getBoundingClientRect(), dh = d.querySelector('.dh'), q = dh.getBoundingClientRect(), x = d.querySelector('[data-act="drawer-close"]'), xr = x && x.getBoundingClientRect();
          return { overflowY: getComputedStyle(d).overflowY, scrollTop: d.scrollTop, scrollH: d.scrollHeight, clientH: d.clientHeight, headIn: q.top >= dr.top - 1 && q.bottom <= dr.bottom + 1, closeIn: !!xr && xr.top >= dr.top - 1 && xr.bottom <= dr.bottom + 1, bodyMoved: db.scrollTop };
        })()`);
        if (r.hidden) continue; // (a panel the run has not opened yet)
        assert.equal(r.overflowY, 'clip', `${sz.id} ${id}: the drawer clips`);
        assert.equal(r.scrollTop, 0, `${sz.id} ${id}: nothing scrolled the drawer itself (it has ${r.scrollH - r.clientH}px of its own to scroll)`);
        assert.ok(r.scrollH - r.clientH <= 1, `${sz.id} ${id}: the drawer has no scroll area of its own (${r.scrollH} in ${r.clientH})`);
        assert.ok(r.headIn && r.closeIn, `${sz.id} ${id}: the title bar and Close are inside the drawer`);
        // a real press on the control scrolled to: the list stays where it is between the press and the release, so the click lands on the control
        const t = await p.eval(`(() => { const d = document.querySelector('#drawer'), db = d.querySelector('.db'), last = [...db.querySelectorAll('button:not([disabled])')].filter((e) => e.getClientRects().length).pop(); if (!last) return null; last.scrollIntoView({ block: 'center' }); const q = last.getBoundingClientRect(); window.__hit = 0; last.addEventListener('click', () => { window.__hit++; }, { once: true }); return { x: q.x + q.width / 2, y: q.y + q.height / 2, act: last.dataset.act || '', label: (last.getAttribute('aria-label') || last.textContent).trim().slice(0, 30) }; })()`);
        if (!t || /^(drawer-close|settings|help|menu)$/.test(t.act)) continue;
        await sleep(400);
        const at = await p.eval(`(() => { const e = document.elementFromPoint(${t.x}, ${t.y}); return e ? e.closest('button') && e.closest('button').dataset.act : null })()`);
        if (!at) continue;
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
        await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1 }); await sleep(80);
        const mid = await p.eval(`document.querySelector('#drawer').scrollTop`);
        await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1 }); await sleep(150);
        assert.equal(mid, 0, `${sz.id} ${id}: pressing "${t.label}" did not scroll the drawer (${mid}px) away from under the finger`);
        assert.equal(await p.eval('window.__hit'), 1, `${sz.id} ${id}: the press on "${t.label}" was a click on it`);
        await p.eval(`document.querySelector('#drawer [data-act="drawer-close"]') && document.querySelector('#drawer [data-act="drawer-close"]').click()`); await sleep(250);
        await p.eval(`(() => { const d = document.querySelector('dialog#dlg'); if (d.open) d.close(); })()`);
      }
    } finally { await closePage(p); }
  } } finally { await b.close(); }
});

test('D3: the check can fail: with the clip taken out of the page, the Market\'s list at 844x390 does scroll the drawer itself (the fault that D2 holds off)', { skip: !BROWSER && 'no Chrome here (D1 holds the sheet)', timeout: 300000 }, async () => {
  const b = await browser(), sz = SIZES[0], slot = `dc3${Date.now() % 1e6}`, p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, sz);
  try {
    await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
    await newGame(p, { perks: 'trades,pro', days: 3 });
    await p.eval(`document.querySelector('.dock [data-d="market"]').click()`); await sleep(500);
    await p.eval(`(() => { const s = document.createElement('style'); s.id = 'noclip'; s.textContent = '#drawer { overflow: hidden !important; } #drawer .db { position: static !important; }'; document.head.append(s); })()`); await sleep(200);
    const r = await p.eval(`(() => { const d = document.querySelector('#drawer'), db = d.querySelector('.db'), last = [...db.querySelectorAll('button, a[href], input, select, summary')].filter((e) => e.getClientRects().length).pop(); last.scrollIntoView({ block: 'center' }); return { scrollTop: d.scrollTop, over: d.scrollHeight - d.clientHeight, sr: db.querySelectorAll('.sr').length }; })()`);
    assert.ok(r.sr > 0, 'the Market\'s list has screen-reader-only spans (what widens the drawer\'s own scroll area)');
    assert.ok(r.over > 1 && r.scrollTop > 0, `without the fix the drawer scrolls by itself (${r.over}px of overflow, scrolled ${r.scrollTop}px): the check in D2 is measuring something`);
  } finally { await closePage(p); await b.close(); }
});
