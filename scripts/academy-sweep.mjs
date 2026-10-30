// The Academy card's matrix sweep: the proof the coach card is judged by.
//
//   node scripts/academy-sweep.mjs [--level quick|std|full] [--lessons 1,2,5] [--sizes 360x640,844x390] [--modes mouse,touch] [--jobs 2] [--steps 0,1] [--states plain,drawer:market]
//                                  [--variants base,hint] [--cell-ms 150000: how long one lesson's state may take before it is tried again on a fresh page, and then reported as a sweep-error; a busy machine needs more] [--frames N: wait N animation frames after each change, as a page does; the default lays the page out at once] [--json out.json] [--faults 40] [--port N] [--base http://host:port]
//
// For every lesson (1 to 10) and every step (the last card, after the final step, included), at every window size (1280x800, 1024x768, 768x1024, 844x390, 640x360, 360x640), with a mouse and with a
// finger (a coarse pointer: every button grows to 44px), in every state the player can put the game in (no panel, each panel the lesson can open at the top and at the foot of its scroll, each Deal
// Room stage the lesson's setup allows, the hire dialog, the Cash breakdown, the lesson menu, an alert) and in every variant (the card as it first arrives, with the 20-second hint, with toasts over the
// game, at the largest text size, asking "Skip this lesson?", and closed early) the sweep measures the card and prints what is wrong with it:
//
//   covers-<kind>      the card covers a control by more than a pixel, or a sampled tap on the control (centre and a 5 by 5 grid, elementFromPoint) lands on the card. <kind>: drawer-head (the panel's Close and its
//                      title bar), drawer (the buttons in the panel), dock, hud, camera, tracker, ticker, dialog, other
//   covers-target      the card covers the thing the step names (when it is smaller than a quarter of the window)
//   (A card the player asked for, opened from its tab or asking "Skip this lesson?", is theirs: it must show everything and every button must work, and it may cover what it covers.)
//   words-hidden       the step's words are not on the screen at a size a person can read (0 by 0, clipped by the card's own scroll, outside the window), and there is no tab to open them from
//   hint-hidden        the same for the 20-second hint, once it is due
//   own-<problem>      one of the card's own buttons (Show me, Skip lesson, Restart, Yes skip it, Keep going, the tab, Fold away) is missing, cut, or under something: own-missing, own-clipped, own-covered
//   tab-unnamed     a folded card whose tab has no name that says what it opens (and, with the hint due, "Hint"), or whose words are not in the page for a screen reader
//   card-offscreen     the card is not wholly inside the window
//   toast-over-card    a toast that is not dimmed lies over the card's words or buttons
//   no-card            there is no card
//
// A card that is folded to its tab is measured twice: folded (the tab must be reachable and named, and nothing under it may be covered) and opened by a tap on the tab (the words, the hint and every
// button must be on the screen; the open card is the player's own doing and is allowed to cover what it covers). The judge (`judge`) is pure and tested without a browser (tests/academy-sweep.test.mjs);
// the page half is scripts/academy-sweep-page.js, which reads the page and decides nothing. The page is given pc.acProbe (js/ui/academy.js) to put the card in any step without playing the lesson,
// and its animations and transitions are stopped so a card is measured where it stands, not where it is going.
// Exit status: 0 when every cell is clean, 1 when any is not.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNet } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ the matrix
export const SIZES = [
  { id: '1280x800', w: 1280, h: 800, dsf: 1 }, { id: '1024x768', w: 1024, h: 768, dsf: 1 }, { id: '768x1024', w: 768, h: 1024, dsf: 2 },
  { id: '844x390', w: 844, h: 390, dsf: 3 }, { id: '640x360', w: 640, h: 360, dsf: 2 }, { id: '360x640', w: 360, h: 640, dsf: 3 },
];
export const MODES = ['mouse', 'touch'];
export const LESSONS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10'];
export const VARIANTS = ['base', 'hint', 'toast', 'xl', 'confirm', 'stranded'];
/** The variants every state is measured in, by level: quick is the card as it arrives and with its hint, std adds the states' toast and text size on the states a player is mostly in, full is the whole product. */
export function variantsFor(level, state) {
  if (level === 'quick') return ['base', 'hint'];
  const main = state === 'plain' || /^drawer:[a-z]+$/.test(state) || /^deal:\w+:(pitch|read|fix|close|next)$/.test(state) || state === 'hire' || state === 'cash';
  if (level === 'std') return main ? ['base', 'hint', 'toast', 'xl', 'confirm', 'stranded'] : ['base', 'hint'];
  return VARIANTS.slice();
}
/** The states to visit, by level, out of what the lesson can be put in (the page lists them). */
export function statesFor(level, all) {
  if (level === 'quick') return all.filter((s) => s === 'plain' || /^drawer:[a-z]+$/.test(s) || /^deal:\w+:(pitch|read|fix)$/.test(s) || s === 'hire');
  if (level === 'std') return all.filter((s) => !/-done$/.test(s) || /^deal:\w+:(pitch|read|fix)-done$/.test(s));
  return all.slice();
}

// ------------------------------------------------------------------ the judge (pure)
const EPS = 0.25;           // a control touched by less than this in either direction is not covered: boxes meet at fractions of a pixel
const SHOWN = 0.98;         // how much of a piece of text or a button must be seen
const hintDue = (v) => /^(hint|toast|xl)/.test(v || '');
const isOpen = (v) => /\+open$/.test(v || '');
/** What is wrong with one measurement of the card (a cell). Returns [{ type, detail }]. */
export function judge(m) {
  const out = [], add = (type, detail) => out.push({ type, detail });
  if (!m || m.none || !m.card) { add('no-card', 'there is no coach card'); return out; }
  const confirm = /^confirm/.test(m.variant || ''), c = m.card, open = isOpen(m.variant) || confirm, hint = hintDue(m.variant), stranded = /^stranded/.test(m.variant || ''); // the question "Skip this lesson?" is the player's own doing, as the card opened from its tab is
  const v = m.view;
  // --- where it stands
  const R = c.rect;
  if (R.x < -0.5 || R.y < -0.5 || R.x + R.w > v.w + 0.5 || R.y + R.h > v.h + 0.5) add('card-offscreen', `card ${R.x},${R.y} ${R.w}x${R.h} is not inside ${v.w}x${v.h}`);
  // --- what it covers (the open card is the player's own doing, and covers what it covers)
  if (!open) {
    for (const k of m.controls || []) {
      if ((k.overlapW > EPS && k.overlapH > EPS) || k.tapsInCard > 0) add('covers-' + k.kind, `${k.what} ${k.cover}% under the card (${k.tapsInCard}/${k.taps} taps land on it)`);
    }
    const t = m.target;
    if (t && t.rect && t.via !== 'fallback' && t.rect.w * t.rect.h < 0.25 * v.w * v.h) {
      const ox = Math.min(R.x + R.w, t.rect.x + t.rect.w) - Math.max(R.x, t.rect.x), oy = Math.min(R.y + R.h, t.rect.y + t.rect.h) - Math.max(R.y, t.rect.y);
      if (ox > EPS && oy > EPS) add('covers-target', `the step's ${t.anchor} is under the card`);
    }
  }
  // --- what it says. A card folded to its tab keeps the words in the page, for a screen reader, and names the tab for what it opens.
  const own = (act) => (c.buttons || []).find((b) => b.act === act);
  const reach = (act, why) => {
    const b = own(act);
    if (!b) { add('own-missing', `${why || act}: no such button`); return; }
    if (!b.on || b.w < 4 || b.h < 4) add('own-missing', `${why || act}: drawn at ${b.w}x${b.h}`);
    else if (b.frac < SHOWN) add('own-clipped', `${why || act}: ${Math.round(b.frac * 100)}% of it is on the screen`);
    else if (b.hit !== 'self') add('own-covered', `${why || act}: a tap lands on ${b.hit}`);
  };
  const words = (el, what, type) => {
    if (!el || !el.on || el.w < 24 || el.h < 10) { add(type, `${what} drawn ${el ? `${el.w}x${el.h}` : 'nowhere'}`); return; }
    if (el.frac < SHOWN) add(type, `${what}: ${Math.round(el.frac * 100)}% of it is on the screen`);
  };
  if (c.folded && !open) {
    const g = own('ac-expand');
    if (!g) add('tab-unnamed', 'the card is folded and has no tab');
    else {
      reach('ac-expand', 'the tab');
      const name = `${g.label} ${g.text}`;
      if (!g.label || !/lesson|step|hint/i.test(name) || (hint && !/hint/i.test(name))) add('tab-unnamed', `the tab is named "${g.label}" / "${g.text}"`);
    }
    if (!c.say || !c.say.on || !c.say.text) add('tab-unnamed', 'the folded card keeps no words for a screen reader');
    if (hint && !confirm && !stranded && (!c.hint || !c.hint.on || !c.hint.text)) add('tab-unnamed', 'the folded card keeps no hint for a screen reader');
  } else {
    words(c.say, 'the words', 'words-hidden');
    if (hint && !confirm && !stranded) words(c.hint, 'the hint', 'hint-hidden');
    if (confirm) { reach('ac-skip-yes', 'Yes, skip it'); reach('ac-skip-no', 'Keep going'); }
    else if (stranded || c.stranded) { reach('ac-restart', 'Restart'); reach('ac-skip', 'Skip lesson'); }
    else { reach('ac-showme', 'Show me'); reach('ac-skip', 'Skip lesson'); if (hint) reach('ac-restart', 'Restart'); }
    if (isOpen(m.variant)) reach('ac-fold', 'Fold away');
  }
  // --- a toast over the words or the buttons (the card dims a toast it stands over; one that is not dimmed is in the way)
  for (const t of c.toasts || []) if (!t.bad) add('toast-over-card', `a toast covers ${t.over} (${t.area}px2)`);
  return out;
}

/** The cells of a run, counted by the problem and the size. `rows`: [{ size, mode, faults: [{type}] }]. */
export function tally(rows) {
  const types = new Map(), sizes = new Map();
  for (const r of rows) {
    const s = sizes.get(r.size) || { cells: 0, bad: 0, faults: 0 }; s.cells++; if (r.faults.length) s.bad++; s.faults += r.faults.length; sizes.set(r.size, s);
    for (const f of r.faults) { const t = types.get(f.type) || new Map(); t.set(r.size, (t.get(r.size) || 0) + 1); types.set(f.type, t); }
  }
  return { types, sizes };
}
/** The table of what was found, as lines of text: a row for each problem, a column for each size, then each size's cells and how many are not clean. */
export function table(rows, sizes = SIZES.map((s) => s.id)) {
  const { types, sizes: bySize } = tally(rows), cols = sizes.filter((s) => bySize.has(s));
  const pad = (x, n) => String(x).padStart(n), name = Math.max(18, ...[...types.keys()].map((t) => t.length + 1));
  const lines = [`${'problem'.padEnd(name)} ${cols.map((c) => pad(c, 9)).join(' ')} ${pad('total', 7)}`];
  for (const [t, per] of [...types].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
    const tot = [...per.values()].reduce((x, y) => x + y, 0);
    lines.push(`${t.padEnd(name)} ${cols.map((c) => pad(per.get(c) || 0, 9)).join(' ')} ${pad(tot, 7)}`);
  }
  lines.push(`${'cells measured'.padEnd(name)} ${cols.map((c) => pad(bySize.get(c).cells, 9)).join(' ')} ${pad(rows.length, 7)}`);
  lines.push(`${'cells with a fault'.padEnd(name)} ${cols.map((c) => pad(bySize.get(c).bad, 9)).join(' ')} ${pad([...bySize.values()].reduce((x, y) => x + y.bad, 0), 7)}`);
  return lines;
}

// ------------------------------------------------------------------ the browser half
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PAGE_LIB = () => readFileSync(join(HERE, 'academy-sweep-page.js'), 'utf8');
const QUIET = '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took more than ${ms / 1000}s`)), ms))]);

async function until(p, expr, what, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await p.eval(expr)) return; } catch { /* between screens */ } await sleep(100); }
  throw new Error(`timed out waiting for ${what}`);
}

/** A page on the lesson's first step, with the probe in hand and the page's half loaded. `touch`: a coarse pointer, as on a phone. */
export async function lessonPage(env, lesson, size, mode) {
  const slot = `sw${lesson}${size.id}${mode}${Date.now() % 1e6}`;
  const p = await env.open(env.chrome, `${env.base}/?slot=${slot}`, { w: size.w, h: size.h, dsf: size.dsf, mobile: mode === 'touch' });
  if (mode === 'touch') await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ready = `location.protocol.startsWith('http') && document.readyState==='complete' && !window.__old && !!document.querySelector('button[data-act="academy"]')`;
  await until(p, ready, 'the title screen', 90000);
  const done = LESSONS.slice(0, LESSONS.indexOf(lesson));
  await p.eval(`localStorage.setItem('pc.academy.${slot}', ${JSON.stringify(JSON.stringify(done))}); window.__old = 1; location.reload()`);
  await sleep(300);
  await until(p, ready, 'the title screen again', 90000);
  await p.eval(`window.pc.acProbe = (a) => { window.__ac = a; }; document.querySelector('button[data-act="academy"]').click()`);
  await until(p, `!!document.querySelector('[data-act="ac-start"]')`, "the lesson's first card");
  await p.eval(`document.querySelector('[data-act="ac-start"]').click()`);
  await until(p, `!!window.__ac && !!document.querySelector('.ac-coach')`, 'the coach card');
  await p.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(QUIET)}; document.head.append(s); })()`);
  await p.eval(PAGE_LIB());
  p.slot = slot;
  return p;
}

/** One lesson at one size and mode: every state and variant the level asks for. Returns [{ lesson, size, mode, state, step, variant, faults, ...measurement }]. */
export async function sweepLesson(env, lesson, size, mode, o = {}) {
  const level = o.level || 'std', rows = [], log = o.log || (() => {});
  let p = await lessonPage(env, lesson, size, mode);
  try {
    const all = await p.eval(`__sw.states(__ac)`), n = await p.eval(`__ac.steps`);
    let ids = statesFor(level, all);
    if (o.states) ids = ids.filter((s) => o.states.some((x) => s === x || s.startsWith(x + ':')));
    const stepList = o.steps || Array.from({ length: n + 1 }, (_, i) => i);
    for (const id of ids) {
      if (/^deal:\w+:result$/.test(id)) { await p.close().catch(() => {}); p = await lessonPage(env, lesson, size, mode); } // a finished deal spends the sandbox: the next state starts on a fresh lesson
      const vars = (o.variants || variantsFor(level, id)).filter((v) => VARIANTS.includes(v));
      // a cell that hangs (a page that never answers: it happens on one cell in tens of thousands, and the same cell run alone takes four seconds) is tried once more on a fresh page before it is a sweep-error
      let res = null, failure = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try { res = await withTimeout(p.eval(`__sw.batch(__ac, ${JSON.stringify(id)}, ${JSON.stringify(stepList)}, ${JSON.stringify(vars)}, ${JSON.stringify({ frames: o.frames || 0 })})`), +o['cell-ms'] || 150000, `${lesson} ${size.id} ${mode} ${id}`); }
        catch (e) { failure = e; await p.close().catch(() => {}); p = await lessonPage(env, lesson, size, mode); }
      }
      if (!res) { rows.push({ lesson, size: size.id, mode, state: id, step: -1, variant: '-', faults: [{ type: 'sweep-error', detail: String(failure.message || failure).slice(0, 200) }] }); continue; }
      if (res.skipped) continue;
      for (const m of res.cells) {
        const faults = judge(m);
        rows.push({ lesson, size: size.id, mode, state: m.state, step: m.step, variant: m.variant, shape: m.card ? m.card.cls : '-', card: m.card ? m.card.rect : null, faults });
      }
      log(`${lesson} ${size.id} ${mode} ${id}: ${res.cells.length} cells, ${res.cells.filter((c) => judge(c).length).length} with a fault`);
    }
  } finally { await p.close().catch(() => {}); }
  return rows;
}

export async function startEnv(o = {}) {
  const { launch, open } = await import('./cdp.mjs');
  let server = null, base = o.base;
  if (!base) {
    const { handler } = await import('../server/static.mjs');
    server = createServer(handler); await new Promise((ok) => server.listen(o.port ? +o.port : 0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const chrome = await launch(o.cdp ? +o.cdp : await freePort());
  return { base, chrome, open, close: async () => { chrome.close(); server?.closeAllConnections?.(); if (server) await new Promise((ok) => server.close(ok)); } };
}

// ------------------------------------------------------------------ the command line
function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } }
  return o;
}
export async function main(argv = process.argv.slice(2)) {
  const o = args(argv), level = o.level || 'std';
  const lessons = o.lessons ? o.lessons.split(',').map((x) => LESSONS[+x - 1]).filter(Boolean) : LESSONS;
  const sizes = o.sizes ? SIZES.filter((s) => o.sizes.split(',').includes(s.id)) : SIZES;
  const modes = o.modes ? o.modes.split(',').filter((x) => MODES.includes(x)) : MODES;
  const run = { level, steps: o.steps ? o.steps.split(',').map(Number) : null, states: o.states ? o.states.split(',') : null, variants: o.variants ? o.variants.split(',') : null, frames: o.frames ? +o.frames : 0, log: o.quiet ? () => {} : (s) => console.error(s) };
  const env = await startEnv(o), rows = [], jobs = [];
  for (const size of sizes) for (const mode of modes) jobs.push({ size, mode });
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const j = jobs[next++]; for (const lesson of lessons) { try { rows.push(...await sweepLesson(env, lesson, j.size, j.mode, run)); } catch (e) { rows.push({ lesson, size: j.size.id, mode: j.mode, state: '-', step: -1, variant: '-', faults: [{ type: 'sweep-error', detail: String(e.message || e).slice(0, 200) }] }); console.error(`${lesson} ${j.size.id} ${j.mode}: ${e.message}`); } } } };
  try { await Promise.all(Array.from({ length: Math.max(1, +o.jobs || 1) }, worker)); } finally { await env.close(); }
  const bad = rows.filter((r) => r.faults.length);
  console.log(table(rows, sizes.map((s) => s.id)).join('\n'));
  const by = new Map();
  for (const r of bad) for (const f of r.faults) { const k = `${r.size} ${r.mode} ${f.type}`; if (!by.has(k)) by.set(k, []); by.get(k).push(`${r.lesson} step ${r.step + 1} ${r.state} [${r.variant}] ${r.shape}: ${f.detail}`); }
  const limit = +o.faults || 3;
  if (by.size) { console.log('\nfirst of each:'); for (const [k, v] of [...by].sort()) console.log(`  ${k} (${v.length}): ${v.slice(0, limit).join('\n      ')}`); }
  if (o.json) writeFileSync(o.json, JSON.stringify(o.all ? rows : bad));
  console.log(`\n${rows.length} cells, ${bad.length} with a fault`);
  process.exitCode = bad.length ? 1 : 0;
  return rows;
}
const isMain = () => { try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]; } catch { return false; } };
if (isMain()) main().then(() => process.exit(process.exitCode || 0), (e) => { console.error(e); process.exit(2); });
