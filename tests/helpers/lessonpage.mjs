// A lesson of the Academy in headless Chrome, for the tests that press things with a real mouse at a phone's window sizes (tests/repair-card.test.mjs).
//   const b = await browser();                         one static server and one Chrome for the file (call b.close() in test.after)
//   const p = await lessonPage(b, 'm06', SIZES[2]);    a fresh page on the lesson's first card, the lessons before it marked done, the hint's clock under the test's hand
//   await tapAt(p, '[data-anchor="dock-crew"]');       the control brought into view the way a finger does it, checked to be what is under the point, then pressed with the real mouse
// The page is waited for as the NEW document (a marker on the old one), never by a sleep. PC_NO_BROWSER=1 or a missing Chrome: `BROWSER` is false and the tests skip.
import assert from 'node:assert/strict';
import { CHROME, BROWSER } from '../../scripts/chrome.mjs';
export { CHROME, BROWSER };
/** Two phones and a desktop window at 200% zoom, the sizes the audit measured at; `touch`: a coarse pointer (buttons grow to 44px), which is how a phone sees the page. */
export const SIZES = [
  { name: '844x390', w: 844, h: 390, dsf: 2, mobile: true, touch: true },
  { name: '360x640', w: 360, h: 640, dsf: 2, mobile: true, touch: true },
  { name: '640x360', w: 640, h: 360, dsf: 2, mobile: false, touch: false },
];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Closes a page without waiting for ever on one that has stopped answering (a page in a loop does not answer the request that closes it, and a test that failed would then never end). */
export const closePage = (p) => Promise.race([p.close().catch(() => {}), sleep(4000)]);
const freePort = async () => { const { createServer } = await import('node:net'); return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };

let shared = null;
export async function browser() {
  if (shared) return shared;
  const { createServer } = await import('node:http'), { handler } = await import('../../server/static.mjs'), { launch, open } = await import('../../scripts/cdp.mjs');
  const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = await launch(await freePort()), base = `http://127.0.0.1:${server.address().port}`;
  // Chrome is killed, but its helper processes can outlive it and keep their connections to the server open: close them from this side, or `server.close` waits for ever and the test process never ends
  shared = { base, chrome, open, close: async () => { chrome.close(); server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); shared = null; } };
  return shared;
}

export const until = async (p, expr, what, ms = 45000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between screens */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`); };
const IDS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];
export async function lessonPage(b, lesson, { w, h, dsf, mobile, touch }) {
  const slot = `rr${lesson}${Date.now() % 1e6}`, p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w, h, dsf, mobile });
  if (touch) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ready = `location.protocol==='http:' && document.readyState==='complete' && !window.__old && !!document.querySelector('button[data-act="academy"]')`;
  await until(p, ready, 'the title screen', 90000);
  const done = IDS.slice(0, IDS.indexOf(lesson));
  if (done.length) { await p.eval(`localStorage.setItem('pc.academy.${slot}', ${JSON.stringify(JSON.stringify(done))}); window.__old = 1; location.reload()`); await sleep(300); await until(p, ready, 'the title screen again', 90000); }
  await p.eval(`document.querySelector('button[data-act="academy"]').click()`); await until(p, `!!document.querySelector('[data-act="ac-start"]')`, 'the lesson\'s first card');
  await p.eval(`document.querySelector('[data-act="ac-start"]').click()`); await until(p, `!!document.querySelector('.ac-coach')`, 'the coach card');
  await p.eval(`(()=>{ const o = performance.now.bind(performance); window.__skew = 0; performance.now = () => o() + window.__skew; })()`); // the hint's clock
  return p;
}
export const atStep = (p, n) => until(p, `/STEP ${n} OF/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'') || !!document.querySelector('.ac-sheet')`, `lesson step ${n}`);
/** Moves the clock the Academy reads 30 seconds on: the hint is due. */
export const hint = async (p) => { await p.eval(`window.__skew += 30000`); await until(p, `!!document.querySelector('.ac-coach .ac-hint, .ac-coach.handle .ac-grab')`, 'the hint'); await p.sleep(500); };

/** The first control matching `sel` (and `re`, against its name) that can be seen and is not the card's own, as an expression for the page. */
const FIND = (sel, re, nth = 0) => `(()=>{ const d=document.querySelector('dialog#dlg'), root=d.open?d:document; const all=[...root.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&!e.closest('.ac-coach')}).filter(e=>new RegExp(${JSON.stringify(re)},'i').test((e.getAttribute('aria-label')||e.textContent).trim())); return all[${nth}]||null })()`;
/** What a finger does with a window's sheet: scrolls it until the control is in the middle of the part that can be seen (above a sticky foot), elsewhere the browser's own scrollIntoView. */
const BRING = `(()=>{ const e=window.__t, d=document.querySelector('dialog#dlg'), STICKY='.deal-dock, .deal-foot, .deal-result > .row:last-child, .cr-foot';
  if(!d.open||!d.contains(e)) { e.scrollIntoView({ block: 'center', inline: 'nearest' }); return; } if (e.closest(STICKY)) return;
  const dr=d.getBoundingClientRect(), foots=[...d.querySelectorAll(STICKY)].filter(f=>f.getBoundingClientRect().height>0), top=dr.top, bottom=Math.min(dr.bottom, ...foots.map(f=>f.getBoundingClientRect().top)), r=e.getBoundingClientRect();
  d.scrollTop += (r.top + r.height/2) - (top + bottom)/2; })()`;
const AT = `(()=>{ const e=window.__t, b=e.getBoundingClientRect(), x=b.x+b.width/2, y=b.y+b.height/2, h=document.elementFromPoint(x,y); return { x, y, lands: !!h&&(e===h||e.contains(h)), hit: h ? h.tagName+'#'+h.id+'.'+String(h.className).slice(0,30) : 'nothing' } })()`;

/** Finds, brings into view, lets the card settle (it looks again every 200ms and glides for 250), and answers where the middle of the control is and what is there. */
export async function aim(p, sel, re = '.', nth = 0) {
  await until(p, `(window.__t = ${FIND(sel, re, nth)}) && true`, `${sel} ${re}`);
  await p.eval(BRING); await p.sleep(750);
  return p.eval(AT);
}
/** A real tap at the control's middle (aim first; the tap is asserted to land on the control, not on the card). `gap`: how long the button is held down. */
export async function tapAt(p, sel, re = '.', { nth = 0, gap = 60 } = {}) {
  const m = await aim(p, sel, re, nth);
  assert.ok(m.lands, `${sel} ${re}: a tap at the middle lands on the control (it lands on ${m.hit})`);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: m.x, y: m.y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: m.x, y: m.y, button: 'left', clickCount: 1 });
  await sleep(gap);
  const during = await p.eval(`(()=>{ const e=window.__t, h=document.elementFromPoint(${m.x},${m.y}); return { lands: !!e && e.isConnected && !!h && (e===h||e.contains(h)), hit: h ? h.tagName+'#'+h.id+'.'+String(h.className).slice(0,30) : 'nothing' } })()`); // the card must not have moved under the finger
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: m.x, y: m.y, button: 'left', clickCount: 1 });
  await p.sleep(350);
  return { ...m, during };
}
export const closeCash = async (p) => { await until(p, `document.querySelector('dialog#dlg').open`, 'the Cash breakdown'); await p.key('Escape', { wait: 400 }); await until(p, `!document.querySelector('dialog#dlg').open`, 'the breakdown closed'); };
