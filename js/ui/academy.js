// The Academy (docs/V2_DESIGN.md section 9): ten short missions played in the REAL interface against the REAL engine, in a scripted sandbox.
// Each mission: an intro card, the lesson (coach marks pointing at real controls), WHY it worked (formula and a worked example), a teach-back question,
// and a reward (XP, a skill point, Codex pages). The pure parts live in ./academy-sandbox.js and are tested without a browser.
//
//   mountAcademy(root, S, { onDone, onSkip, only, missions }) -> cleanup()
//     S        the real Session. A lesson never writes to it; rewards reach S.game only when a real run exists (otherwise they wait in kv 'academyRewards').
//     only     a mission id: play just that lesson (a replay pays nothing if it was already done).
//     onDone   called after the last lesson (or the one replayed); onSkip when the player leaves the Academy early. Both after cleanup.
//   pendingRewards() / claimPendingRewards(game): for main.js, to hand lesson rewards to a run that starts after the Academy.
//
// The sandbox is mounted in the real game shell (mountGame) with U.features limiting the dock and U.tracker showing the lesson goal.
//
// Two things the lesson data cannot do and the runner does:
//  - A lesson can be spent. Its one paperclip sold to the wrong buyer, the only counterfeit bought blind, a manager the wallet cannot feed, a scripted shock used up before its
//    step: nothing refills in a sandbox, so the lesson can only be restarted. After every game event, whenever a step begins and once a second the runner asks stillPossible()
//    (./academy-sandbox.js) and, the moment the answer is no, swaps the coach card for a "closed early" card with Restart (it does not wait for the 20-second hint). The sandbox
//    is rebuilt from the lesson's setup; the real run is never touched.
//  - A lesson can send the player into a dialog. The hire dialog is a modal over the Crew drawer, so a coach card behind it could never be read: while it is open, a step that
//    waits for the hire is pointed at the dialog's own controls (data-anchor hire-<manager> and hire-go, drawers/crew.js) and the card hops into the dialog, as it does into the
//    Deal Room. Any step may also name one of those anchors itself.
//  - A card must be readable wherever the player is. While ANY window is open (the Deal Room, a Cash breakdown, an alert) the card is inside it, so its 20-second hint is never under a
//    modal. A thing the card cannot frame is never pointed at as if it could: unseenNote (./academy-sandbox.js) says what to do to bring it up (a Deal Room control before a deal is
//    open, the news line before there is news) or that it is behind the window, and Show me says "Nothing to frame yet" rather than "the gold frame".
import { $, esc, delegate, dlg, toast, announce, sfx, burst, reduced } from './common.js';
import { countUp } from './polish.js';
import { kv } from '../session.js';
import { ZONES } from '../config.js';
import { Progress, CODEX_BY_ID } from '../meta/progress.js';
import { ACADEMY as MISSIONS } from '../meta/academy.js';
import {
  parseAnchor, resolveAnchor, hitMatches, keepClear, fitCard, chooseSize, coverScore, rectsOverlap, coverOf, pointInRect, startRun, feedRun, coachFor, satisfiedNow, shortSay, hintDue,
  newTeach, pickTeach, revealTeach, teachDone, teachFirstTry, readAcademy, markMission, nextIndex, rewardPlan, applyRewards,
  readPending, addPending, claimPending, codexSeed, emptyMeta, makeSandboxSession, featuresFor, KEYS,
  newLookout, hireSnapshot, hireCoach, unseenNote,
} from './academy-sandbox.js';

export const missionList = () => MISSIONS;

let shellP = null;
const loadShell = () => (shellP ||= Promise.all([import('./shell.js'), import('./deal.js')]).then(([sh, dl]) => ({ mountGame: sh.mountGame, openDealOf: dl.openDealOf }))); // loaded when a lesson starts: the intro and the pure parts do not need the whole game screen

export const pendingRewards = (store = kv) => readPending(store);
export function claimPendingRewards(game, store = kv) { return claimPending(store, game, (g) => new Progress(g)); }

// ------------------------------------------------------------------ the cards (pure strings, tested)
const LETTERS = ['A', 'B', 'C', 'D'];
const pretty = (id) => String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const para = (t) => `<p>${esc(t)}</p>`;
const entryOf = (id, lookup) => lookup?.(id) || { id, title: pretty(id), icon: '', summary: '' };

export function introHTML(m, { index, total, st, concept, replay, missions = [] }) {
  const state = (id, i) => (st.done.includes(id) ? 'done' : st.skipped.includes(id) ? 'skipped' : i === index ? 'now' : 'todo');
  const label = { done: 'done', skipped: 'skipped', now: 'this lesson', todo: 'not played yet' };
  const pips = missions.map((x, i) => `<li class="ac-pip ${state(x.id, i)}" aria-label="Lesson ${i + 1} of ${total}, ${label[state(x.id, i)]}: ${esc(x.title)}"><span aria-hidden="true">${state(x.id, i) === 'done' ? '✓' : i + 1}</span></li>`).join('');
  const facts = [`About ${Math.max(1, Math.round(+m.minutes || 2))} min`, ZONES[m.zone] ? ZONES[m.zone].name : '', concept ? `You will learn: ${concept.title}` : ''].filter(Boolean);
  return `<section class="ac-intro panel" aria-labelledby="ac-h">
    <p class="ac-eyebrow mono">Academy &middot; Lesson ${index + 1} of ${total}${replay ? ' &middot; replay' : ''}</p>
    <h1 id="ac-h" tabindex="-1"><span aria-hidden="true">${esc(m.icon || '')}</span> ${esc(m.title)}</h1>
    <p class="ac-scene">${esc(m.intro || '')}</p>
    <ul class="ac-facts">${facts.map((f) => `<li class="chip info">${esc(f)}</li>`).join('')}</ul>
    <ol class="ac-pips" aria-label="Your lessons">${pips}</ol>
    <div class="row gap"><button class="btn big" data-act="ac-start" autofocus>${replay ? 'Replay the lesson' : 'Start the lesson'}</button><button class="btn ghost" data-act="ac-leave">Leave the Academy</button></div>
    <p class="small mute">${replay ? 'A replay is for learning: it pays no new XP.' : 'Nothing you do in a lesson touches your real run.'}</p>
  </section>`;
}

/**
 * The coach card's inside. o = { showMe, hint (bool), confirm (bool), manual (bool), title, where, framed, exists, clipped }. The runner says what the player can really see: `framed` (a gold frame is
 * drawn round the thing), `exists` (the thing is on screen but too big to frame) and `where` (a sentence for a thing that is not on screen yet, or is under a window: academy-sandbox.js,
 * unseenNote). A card made without them (a test, a print) says what it always said. The card never claims a frame there is none of: Show me is honest about it.
 * `fold` (a Deal Room: the card may fold to a tab) adds the tab's button, `open` (the player opened it) the Fold away button.
 */
export function coachHTML(c, o = {}) {
  const dots = Array.from({ length: Math.min(12, Math.max(0, c.total | 0)) }, (_, i) => `<i${c.finishing || i <= c.index ? ' class="on"' : ''}></i>`).join('');
  const head = `<div class="ac-head"><small class="ac-eyebrow mono">${esc(o.title || 'Lesson')} &middot; ${c.finishing ? 'Last step' : `Step ${c.index + 1} of ${c.total}`}</small>${dots ? `<span class="ac-dots" aria-hidden="true">${dots}</span>` : ''}</div>`;
  if (o.confirm) {
    return `${head}<p class="ac-say" id="ac-say">Skip this lesson? You will still see why it works and answer one question.</p>
      <div class="ac-btns"><button class="btn sm" data-act="ac-skip-yes">Yes, skip it</button><button class="btn sm ghost" data-act="ac-skip-no">Keep going</button></div>`;
  }
  const framed = o.framed !== false;
  // In a Deal Room the card can fold to a one-line tab (css `handle`) where it would cover the room's buttons: the tab is a button that opens the card, and the open card has Fold away. The words stay in the page for a screen reader.
  const step = c.finishing ? 'last step' : `step ${c.index + 1} of ${c.total}`;
  const grab = o.fold ? `<button class="ac-grab" data-act="ac-expand" aria-expanded="false" title="Read the lesson card" aria-label="${esc(`Lesson card, ${step}${o.hint ? ', with a hint' : ''}. Open it to read.`)}">${o.hint ? 'Hint' : c.finishing ? 'Last step' : `Step ${c.index + 1} of ${c.total}`}</button>` : '';
  const foldBtn = o.fold && o.open ? '<button class="btn sm ghost" data-act="ac-fold" aria-expanded="true">Fold away</button>' : '';
  const look = !o.showMe ? '' : framed ? 'It is the control with the gold frame.' : o.clipped ? 'It is lower down this panel.' : o.exists ? 'It is too big for a frame: it covers most of the screen.' : 'Nothing to frame yet.';
  return `${head}${grab}<p class="ac-say" id="ac-say">${esc(c.say)}</p>
    ${o.where ? `<p class="ac-where" role="note">${esc(o.where)}</p>` : ''}${look ? `<p class="ac-look" role="note">${esc(look)}</p>` : ''}
    ${o.hint ? `<p class="ac-hint" role="note"><b>Hint:</b> ${esc(c.hint)}</p>` : ''}
    <div class="ac-btns">${o.manual ? '<button class="btn sm" data-act="ac-continue">Continue</button>' : ''}<button class="btn sm ghost" data-act="ac-showme" aria-pressed="${!!o.showMe}">Show me</button><button class="btn sm ghost" data-act="ac-skip">Skip lesson</button>${o.hint ? '<button class="btn sm ghost" data-act="ac-restart">Restart</button>' : ''}${foldBtn}</div>`;
}

/** The coach card when the lesson can no longer be finished (c = { say, hint } from strandedFor): what happened, then Restart as the one primary button. */
export function strandedHTML(c, o = {}) {
  return `<div class="ac-head"><small class="ac-eyebrow mono">${esc(o.title || 'Lesson')} &middot; Closed early</small></div>
    <p class="ac-say" id="ac-say">${esc(c.say)}</p>
    <p class="ac-lost">${esc(c.hint)}</p>
    <div class="ac-btns"><button class="btn sm" data-act="ac-restart" data-fid="ac-restart">Restart</button><button class="btn sm ghost" data-act="ac-skip">Skip lesson</button></div>`;
}

export function whyHTML(m, { skipped, index, total } = {}) {
  const w = m.why || {}, ex = w.example;
  return `<p class="ac-eyebrow mono">Lesson ${(index ?? 0) + 1} of ${total ?? ''} &middot; Why it worked</p>
    <h2 id="ac-sh" tabindex="-1">${esc(w.title || m.title)}</h2>
    ${skipped ? '<p class="callout warn">You skipped the hands-on part, so no XP this time. You can play it from the Codex whenever you like.</p>' : ''}
    ${(w.body || []).map(para).join('')}
    ${w.formula ? `<pre class="ac-formula mono" aria-label="Formula">${esc(w.formula)}</pre>` : ''}
    ${ex ? `<section class="ac-ex" aria-label="Worked example"><h3>Worked example</h3>${para(ex.setup)}<ol>${(ex.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="ac-result"><b>Result:</b> ${esc(ex.result)}</p></section>` : ''}
    <div class="row gap"><button class="btn big" data-act="ac-why-next">${m.teachBack ? 'Test myself' : 'Continue'}</button></div>`;
}

export function teachHTML(m, state) {
  const tb = m.teachBack, opts = tb.options || [], right = opts.findIndex((o) => o.correct), last = state.picks[state.picks.length - 1];
  const done = teachDone(state);
  const rows = opts.map((o, i) => {
    const picked = state.picks.includes(i), good = picked && o.correct, bad = picked && !o.correct, reveal = state.revealed && i === right;
    const cls = good || reveal ? 'right' : bad ? 'wrong' : '';
    const says = (re) => re.test(String(o.why).trim()); // a reason that already opens with its own verdict needs no second one
    const verdict = good ? (says(/^(yes|correct|right|exactly)\b/i) ? '' : '<b class="green">Yes.</b> ') : bad ? (says(/^(no|not|nope|wrong)\b/i) ? '' : '<b class="red">Not quite.</b> ') : reveal ? '<b class="green">This one.</b> ' : '';
    return `<li><button class="ac-opt ${cls}" data-act="ac-pick" data-i="${i}" ${picked || done ? 'aria-disabled="true"' : ''} aria-pressed="${picked}"><span class="ac-k" aria-hidden="true">${LETTERS[i] || i + 1}</span><span>${esc(o.text)}</span></button>${picked || reveal ? `<p class="ac-why ${good || reveal ? 'good' : 'bad'}">${verdict}${esc(o.why)}</p>` : ''}</li>`;
  }).join('');
  const live = last == null ? '' : opts[last].correct ? `Correct. ${opts[last].why}` : `Not quite. ${opts[last].why}`;
  const after = state.solved ? `<p class="callout good">${teachFirstTry(state) ? 'First try.' : 'Got it.'} That is the idea the lesson was built on.</p>`
    : state.revealed ? '<p class="callout">That is the answer. Read why each choice is right or wrong, then carry on.</p>'
      : state.picks.length ? '<p class="callout warn">Read why, then try another one. Wrong guesses are fine here.</p>' : '';
  return `<p class="ac-eyebrow mono">Teach-back</p>
    <h2 id="ac-sh" tabindex="-1">${esc(tb.q)}</h2>
    <ul class="ac-opts" aria-label="Choose the true explanation">${rows}</ul>
    <div class="ac-fb sr" role="status" aria-live="polite">${esc(live)}</div>${after}
    <div class="row gap">${done ? '<button class="btn big" data-act="ac-teach-next">Continue</button>' : state.picks.length ? '<button class="btn ghost" data-act="ac-reveal">Show me the answer</button>' : ''}</div>`;
}

/** paid = { xp, points, newCodex, knownCodex, pending } from applyRewards (or the plan, when the run has not started yet). */
export function rewardHTML(m, paid, lookup, { last, skipped, replay, index, total, only } = {}) {
  const ids = [...(paid.newCodex || []), ...(paid.knownCodex || [])];
  const chips = [paid.xp ? `<li class="chip good" data-count="${+paid.xp || 0}" data-fmt="int" data-pre="+" data-post=" XP">+${paid.xp} XP</li>` : '', paid.points ? `<li class="chip good">+${paid.points} skill point</li>` : ''].join('');
  const cards = ids.map((id) => { const e = entryOf(id, lookup), fresh = (paid.newCodex || []).includes(id); return `<li class="ac-cxcard"><span class="ac-cxi" aria-hidden="true">${esc(e.icon || '')}</span><div><b>${esc(e.title)}</b>${fresh ? ' <span class="chip info">New</span>' : ''}<p class="small mute">${esc(e.summary || '')}</p></div></li>`; }).join('');
  const note = replay ? 'A replay pays nothing new, but the pages stay in your Codex.' : skipped ? 'Play this lesson hands-on from the Codex to earn its XP and skill point.' : paid.pending ? 'These are held for you and arrive when your run begins.' : 'Added to your run.';
  return `<p class="ac-eyebrow mono">Lesson ${(index ?? 0) + 1} of ${total ?? ''} &middot; Complete</p>
    <h2 id="ac-sh" tabindex="-1">${esc(m.title)}: ${skipped ? 'explained' : 'done'}</h2>
    ${chips ? `<ul class="ac-rw">${chips}</ul>` : ''}
    ${ids.length ? `<h3>${(paid.newCodex || []).length ? 'Added to your Codex' : 'In your Codex'}</h3><ul class="ac-cx">${cards}</ul>` : ''}
    <p class="small mute">${esc(note)}</p>
    <div class="row gap"><button class="btn big" data-act="ac-reward-next">${last ? (only ? 'Done' : 'Finish the Academy') : 'Next lesson'}</button></div>`;
}

/**
 * The stops Tab visits in one of the sheets that follow a lesson, in order: what a keyboard can reach by Tab, which is not the heading (tabindex -1: the page puts the cursor there
 * so it is read, and Tab never lands on it, so a ring would only be drawn for a stop nobody can come back to). `active` is kept even when it is hidden, so the trap still knows where it is.
 */
export const TAB_STOP = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
export function tabStops(root, active) {
  return [...root.querySelectorAll(TAB_STOP)].filter((x) => x.offsetParent !== null || x === active);
}

// ------------------------------------------------------------------ the driver
export function mountAcademy(root, S, { onDone, onSkip, only, missions, store = kv } = {}) {
  const list = Array.isArray(missions) ? missions : MISSIONS;
  let dead = false, cur = null, starting = false, pausedByUs = false;
  const real = () => S?.game || null;
  const lookup = (id) => CODEX_BY_ID[id];

  // The real run's clock waits while a lesson is played from the Menu, and goes on after.
  function pauseReal() { try { if (real() && S.canSetClock?.() && S.clock && !S.clock.paused && !pausedByUs) { S.setPaused(true); pausedByUs = true; } } catch { /* clock not ours to stop */ } }
  function resumeReal() { try { if (pausedByUs) S.setPaused(false); } catch { /* gone */ } pausedByUs = false; }

  function cleanupPlay() { const c = cur; cur = null; c?.destroy(); }
  function cleanupAll() { if (dead) return; dead = true; cleanupPlay(); resumeReal(); }
  function finish(kind, info) { if (dead) return; cleanupAll(); (kind === 'done' ? onDone : onSkip)?.(info); }
  const leave = () => finish('skip');

  // ---------------------------------------------------------------- intro
  function intro(idx) {
    cleanupPlay();
    const m = list[idx], st = readAcademy(store), replay = st.done.includes(m.id);
    root.innerHTML = introHTML(m, { index: idx, total: list.length, st, concept: lookup(m.concept) || null, replay, missions: list });
    delegate(root, { 'ac-start': () => play(idx), 'ac-leave': leave });
    $('#ac-h', root)?.focus({ preventScroll: true });
    announce(`Lesson ${idx + 1} of ${list.length}: ${m.title}. ${m.intro || ''}`);
  }
  const advance = (idx) => { if (only || idx + 1 >= list.length) finish('done', { completed: readAcademy(store).done.length, finished: readAcademy(store).finished }); else intro(idx + 1); };

  // ---------------------------------------------------------------- a lesson
  async function play(idx) {
    if (starting || dead) return;
    starting = true;
    let shell;
    try { shell = await loadShell(); } catch (err) { starting = false; console.error(err); toast('The lesson could not start. You can leave the Academy and try again later.', 'bad'); return; }
    starting = false;
    if (dead) return;
    cleanupPlay();
    pauseReal();
    try { cur = lesson(shell.mountGame, idx, shell.openDealOf); } catch (err) { console.error(err); toast('The lesson could not start. You can leave the Academy and try again later.', 'bad'); intro(idx); }
  }

  function lesson(mountGame, idx, dealOf) {
    const m = list[idx];
    const pend = readPending(store), meta = { ...emptyMeta(), cx: codexSeed(real()?.s.meta?.cx, pend) };
    const sb = makeSandboxSession(m.setup, { id: m.id, zone: m.zone, handle: S?.handle || 'You', meta });
    const stubs = { onDebrief() {}, onTutorial() {}, onJoin() {}, onReset() {}, onAcademy: () => toast('Finish or leave this lesson first.', 'info') };
    const mounted = mountGame(root, sb, stubs);
    try { return wire(mounted, m, sb, idx, dealOf); } catch (err) { try { mounted.destroy(); } catch { /* half built */ } throw err; }
  }

  /** The lesson on top of a mounted game screen: coach marks, the step resolver, the sheets, the heartbeat. Returns { destroy }. */
  function wire(mounted, m, sb, idx, dealOf) {
    const steps = m.steps || [];
    const { ctx } = mounted, U = ctx.U, off = [];
    U.features = Array.isArray(m.setup?.features) ? featuresFor(m) : null;
    U.zone = sb.game.sandbox.zone;
    let run = startRun(m), stepAt = performance.now(), hintOn = false, showMe = false, confirm = false, manual = null, gone = false;
    let sheet = null, teach = newTeach(), skipped = false, winPending = false, lastKey = '', inerted = [];
    let stranded = null, checkQ = false; // stranded: { say, hint } once the lesson cannot be finished
    const lookout = newLookout(m, sb.game);
    let layer = null, ringEl = null, cardEl = null, bodyEl = null; // the card is a frame with a caret on its edge; its text scrolls in bodyEl, so the caret is never clipped

    U.tracker = () => { const c = stranded || coachFor(m, run); return { title: m.title, desc: shortSay(c.say), icon: m.icon, p: Math.min(run.i, steps.length), n: steps.length, drawer: null }; };
    sb.game.onEvent = (evt) => ctx.emit(evt);  // the sandbox feeds the steps, never quests, achievements or the Codex
    const emit0 = sb.emit.bind(sb);
    sb.emit = (type, data) => { if (type === 'note' && typeof data?.level === 'number') return; emit0(type, data); }; // a pretend level-up is not news
    ctx.render();

    // ---- coach marks
    const domEls = (name) => [...document.querySelectorAll(`[data-anchor="${name}"]`)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const provider = {
      dom: (name) => domEls(name)[0]?.getBoundingClientRect() || null,
      world: (type, id) => { const wv = ctx.world?.(); try { return wv?.rectOf ? wv.rectOf(type, id) : wv?.world?.rectOf ? wv.world.rectOf(type, id) : null; } catch { return null; } },
    };
    const resolve = (anchor) => resolveAnchor(anchor, provider);

    // What the coach says now: the step's own words, or, inside the hire dialog, the dialog's controls, or, when the lesson cannot be finished, how to start it again.
    const hireSnap = () => {
      const d = dlg.el, on = d.open && d.querySelector?.('[data-anchor^="hire-"][aria-pressed="true"]');
      return on ? hireSnapshot(sb.game, sb.game.sandbox.zone, on.getAttribute('data-anchor').slice(5)) : null;
    };
    function coachNow() {
      const c = coachFor(m, run);
      if (stranded) return { ...c, id: 'stranded', say: stranded.say, hint: stranded.hint, anchor: null, stranded: true };
      const w = steps[run.i]?.wait, h = w && w.type === 'event' && w.event === 'hire' ? hireCoach(steps[run.i], hireSnap()) : null;
      return h ? { ...c, id: `${c.id}/${h.id}`, say: h.say, anchor: h.anchor, inDialog: true } : c;
    }
    function ensureLayer() {
      if (layer && layer.isConnected) return;
      layer = document.createElement('div');
      layer.className = 'ac-layer'; layer.dataset.academy = ''; layer.dataset.keep = ''; // keep: the Deal Room repaints its sheet with innerHTML, and setHTML (common.js) leaves a child marked so where it is
      layer.innerHTML = '<div class="ac-ring" aria-hidden="true" hidden></div><section class="ac-coach" role="dialog" aria-modal="false" aria-labelledby="ac-say" tabindex="-1"><div class="ac-coach-in"></div></section>';
      ringEl = layer.firstChild; cardEl = layer.lastChild; bodyEl = cardEl.firstChild;
      ctx.el.overlay.appendChild(layer);
      lastKey = '';
    }
    // A modal dialog (the top layer) hides the overlay the card normally lives in, so while ANY window is open the card goes into it: the Deal Room, the hire dialog, a Cash breakdown, an
    // alert, a confirmation. The card must be readable, and its 20-second hint seen, wherever the player is stuck. A card for a thing the window does not show points at nothing (no ring),
    // says so (unseenNote: it is behind the window, or what to do to make it appear) and stands where it covers the least.
    const dealOpen = () => dlg.el.open && dlg.el.classList.contains('deal');
    const inDialog = (res) => { const el = res?.anchor?.kind === 'dom' ? domEls(res.anchor.name)[0] : null; return !!el && dlg.el.open && dlg.el.contains(el); };
    const hostFor = () => (dlg.el.open ? dlg.el : ctx.el.overlay);
    const modalKind = () => (!dlg.el.open ? null : dealOpen() ? 'deal' : dlg.el.querySelector('[data-anchor^="hire-"]') ? 'hire' : 'dialog');
    // What the card must not hide, as { x, y, w, h, wt } (coverScore): the control the keyboard is on above all (a card over it hides the cursor itself), the drawer and the dock, the
    // controls of the game screen (the tracker, the camera and list buttons, the HUD, the news), and, inside a dialog, its own controls and its head.
    const CONTROLS = 'button, input, select, textarea, summary, a[href], [role="button"]';
    const READ = '.deal .bubble, .deal-stage .callout, .deal-result .rhead, .deal-result .rlines, .deal-score > div';
    function keepRects(host, view) {
      const out = [], add = (e, wt, pad = 0, focus = false, clip = null, ctl = false) => { // clip: the part of the window the element can be seen in (a drawer's scrolling body), so a control scrolled out of it counts for nothing
        if (!e || e === cardEl || cardEl?.contains(e)) return;
        let r = e.getBoundingClientRect();
        if (clip) { const x0 = Math.max(r.left, clip.left), y0 = Math.max(r.top, clip.top), x1 = Math.min(r.right, clip.right), y1 = Math.min(r.bottom, clip.bottom); r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; }
        else r = { x: r.x, y: r.y, width: r.width, height: r.height };
        if (r.width > 0 && r.height > 0) out.push({ x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h: r.height + pad * 2, wt, focus, ctl });
      };
      if (host === dlg.el) {
        // every button and link of the room (the stage's, the footer's, the title bar's) is a control a tap may be aimed at: `ctl`, so the card is sized and placed to touch the fewest, and cut to the sheet they scroll in (keepClear)
        const mine = [...host.querySelectorAll(CONTROLS)].filter((e) => e !== cardEl && !cardEl?.contains(e));
        for (const r of keepClear({ controls: mine.map((e) => e.getBoundingClientRect()), clip: host.getBoundingClientRect() })) out.push({ ...r, focus: false });
        add(host.querySelector('.deal-top'), 1);
        // and what a lesson asks the player to READ in the room: the seller's reply, the stage's result line and the cells of the foot (Cash, Fair price, the quote). They count for less than a control,
        // so the card prefers the empty part of the stage, and stands over them only where nothing is emptier
        for (const e of host.querySelectorAll(READ)) add(e, 0.4);
      } else {
        if (!ctx.el.drawer.hidden) {
          add(ctx.el.drawer, 3);
          // the drawer's own controls, where they are NOW (it scrolls under a card that does not): on a phone the card has to stand over some of the drawer, and a tap that lands on the card is lost,
          // so it stands over the part with the fewest buttons (the card is placed again whenever the drawer scrolls)
          const body = ctx.el.drawer.querySelector('.db');
          if (body) { const clip = body.getBoundingClientRect(); for (const e of body.querySelectorAll(CONTROLS)) add(e, 2, 0, false, clip, true); }
        }
        add(ctx.el.dock, 3);
        if (ctx.el.dock) for (const e of ctx.el.dock.querySelectorAll(CONTROLS)) add(e, 2, 0, false, null, true); // the dock's buttons are how the player moves between panels: a card over one is a tap lost, so a smaller card is tried before one stands over them
        for (const part of [ctx.el.tracker, ctx.el.ticker, ctx.el.hud, ctx.el.world.querySelector('.wvctl'), ctx.el.world.querySelector('.wvlist')]) {
          if (part) for (const e of part.querySelectorAll(CONTROLS)) add(e, 2);
        }
      }
      const f = document.activeElement;
      if (f && f !== document.body && f !== document.documentElement && f.tagName !== 'CANVAS' && !cardEl?.contains(f)) { // the world's canvas is the whole window: it is never "covered"
        const r = f.getBoundingClientRect();
        if (r.width * r.height < view.w * view.h * 0.4) add(f, 1000, 7, true); // 7px: the ring is 3px wide and drawn 2px out. Weighed past everything else together: a card that hides the cursor is wrong wherever else it lands
      }
      return out;
    }

    // Is a DOM anchor's control inside the part of its panel it is seen in? Only a control in the drawer's scrolling body can be out of it (scrolled above or below); every other anchor is as it always was.
    function fullyShown(res) {
      const r = res.rect, el = domEls(res.anchor.name)[0], body = ctx.el.drawer.querySelector('.db');
      if (!(el && body && body.contains(el))) return true;
      const clip = body.getBoundingClientRect();
      return r.x >= clip.left - 1 && r.y >= clip.top - 1 && r.x + r.w <= clip.right + 1 && r.y + r.h <= clip.bottom + 1;
    }
    // Show me brings a control of the drawer that is below its fold (or above it) into view first, so the frame lands on a control that can be seen
    function bringIntoView() {
      const a = parseAnchor(coachNow().anchor), el = a?.kind === 'dom' ? domEls(a.name)[0] : null, body = ctx.el.drawer.querySelector('.db');
      if (el && body && body.contains(el)) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* an old engine: the frame waits */ } }
    }

    let placed = null; // where the card stands: { x, y, key } (a crowded dialog keeps a place that is still about as good, see the end of paintCoach)
    let said = ''; // what the card says about a thing it cannot frame (unseenNote), kept for the announcement a new step makes
    let open = false, openFor = '', foldedSaid = ''; // a Deal Room's card folded to its tab and opened by the player: it stays open until Fold away, a press elsewhere or the next step (openFor); foldedSaid: the step the fold was last announced for
    function paintCoach(force, snap) {
      if (dead || gone || sheet || winPending || run.won) return;
      ensureLayer();
      const c = coachNow(), found = c.stranded ? null : resolve(c.anchor), host = hostFor();
      const res = host === dlg.el && !inDialog(found) ? null : found; // the step's own thing is not in the sheet that has the card: nothing to ring
      if (layer.parentNode !== host) host.appendChild(layer);
      const view = { w: window.innerWidth, h: window.innerHeight };
      const clipped = res?.via === 'dom' && !fullyShown(res); // a control of the drawer's body that has scrolled out of it: a frame would stand on the dock or off the window, and dim all of it
      const spot = res && res.via !== 'fallback' && !clipped && coverOf(res.rect, view) < 0.6 ? res.rect : null, pad = 6;
      const exists = !!res && res.via !== 'fallback'; // on screen and reachable, framed or (a whole panel) too big to frame
      const modal = modalKind(), where = c.stranded ? '' : unseenNote(c.anchor, c.wait, { exists, clipped, modal, deal: modal === 'deal' ? dealOf?.() : null });
      said = where;
      const dealRoom = host === dlg.el && modal === 'deal', foldable = dealRoom && !confirm && !c.stranded; // only a Deal Room's card may fold to a tab, and not the one that asks "Skip this lesson?" or says the lesson is closed
      if (openFor !== c.id || !dealRoom) { open = false; openFor = c.id; }
      const key = [c.id, c.stranded || c.inDialog ? c.say : '', hintOn, showMe, confirm, !!manual, where, spot ? 1 : 0, exists ? 1 : 0, clipped ? 1 : 0].join('|') + (foldable ? (open ? '|open' : '|fold') : '');
      if (force || key !== lastKey) {
        const news = key !== lastKey && c.inDialog; // the dialog's words are spoken once, when they change
        lastKey = key;
        const had = cardEl.contains(document.activeElement) ? document.activeElement.dataset.act : null;
        bodyEl.innerHTML = c.stranded && !confirm ? strandedHTML(c, { title: m.title }) : coachHTML(c, { showMe, hint: hintOn, confirm, manual: !!manual, title: m.title, where, framed: !!spot, exists, clipped, fold: foldable, open: foldable && open });
        cardEl.classList.toggle('stranded', !!c.stranded);
        if (had) cardEl.querySelector(`[data-act="${had}"]`)?.focus({ preventScroll: true });
        if (news) announce(c.say);
      }
      ringEl.hidden = !spot;
      ringEl.classList.toggle('show', !!spot && showMe);
      if (spot) { ringEl.style.width = spot.w + pad * 2 + 'px'; ringEl.style.height = spot.h + pad * 2 + 'px'; ringEl.style.transform = `translate(${Math.round(spot.x - pad)}px, ${Math.round(spot.y - pad)}px)`; }
      const keep = keepRects(host, view), cursor = keep.find((r) => r.focus);
      const over = (p, s) => !!cursor && rectsOverlap({ x: p.x, y: p.y, w: s.w, h: s.h }, cursor);
      const sizeOf = () => { const b = cardEl.getBoundingClientRect(); return { w: b.width || 320, h: b.height || 150 }; };
      if (cursor && over(cardEl.getBoundingClientRect(), sizeOf())) snap = true; // the card is over the cursor now: it leaves at once, whatever moved the cursor or the card
      const TIERS = { full: '', slim: 'slim', compact: 'compact', min: 'compact min', narrow: 'slim narrow', handle: 'handle' }; // slim: the words without the notes (a drawer's buttons are in the way); narrow: slim in a column 15rem wide; compact: head, hint and buttons; min: head and two buttons; handle: a one-line tab that opens the card (the last three a Deal Room only)
      const tier = () => (cardEl.classList.contains('handle') ? 'handle' : cardEl.classList.contains('min') ? 'min' : cardEl.classList.contains('compact') ? 'compact' : cardEl.classList.contains('narrow') ? 'narrow' : cardEl.classList.contains('slim') ? 'slim' : 'full'), was = tier();
      const setTier = (t) => { for (const k of ['slim', 'narrow', 'compact', 'min', 'handle']) cardEl.classList.toggle(k, TIERS[t].split(' ').includes(k)); };
      // The card is placed at its full size first, then at each smaller size while the place it would take is over the control the keyboard is on (a phone on its side, a dialog of wide cards, a window at 200% zoom that
      // is 640 by 360 CSS pixels with the Bid and Drop out buttons in the middle of it: compact, then min) or over a button (the drawer's, the dock's and, in a Deal Room, every button of the room: a tap that lands on the card is lost, and a drawer
      // on a phone leaves the card nowhere else to stand: slim, which keeps the step's words). The first size that is clear wins; when none is, the one that hides the cursor least, then the control the step names, then the fewest buttons (`chooseSize`), and the full card when every one hides the cursor.
      // In a Deal Room, where even the smallest card covers a button (a phone: the room is buttons from edge to edge), the card folds to its tab, which stands in a gap a card cannot; opened by the player, it is the full card, wherever it covers least. What a smaller card
      // drops was read out when it arrived and is there again, in full, the moment nothing is under the card.
      const fit = (t) => { setTier(t); return fitCard(t, sizeOf(), spot, view, keep); };
      const pick = chooseSize(fit, { handle: foldable && !open, narrow: foldable, words: foldable && open });
      setTier(pick.t);
      let size = pick.s, at = pick.p;
      if (tier() !== was) snap = true;
      { // the key that was under the player's finger may be hidden by the smaller card now (display: none drops the cursor): it goes to the first button the card still shows, and a fold is said once a step
        const f = document.activeElement;
        if (f && f !== cardEl && cardEl.contains(f) && !f.getClientRects().length) [...cardEl.querySelectorAll('button')].find((b) => b.getClientRects().length)?.focus({ preventScroll: true });
        if (tier() === 'handle' && was !== 'handle' && foldedSaid !== c.id) { foldedSaid = c.id; announce('The lesson card is folded to a tab so it does not cover the buttons. Press C, then Enter, to open it.'); }
      }
      const here = `${c.id}|${host === dlg.el ? 'dlg' : 'page'}|${Math.round(size.w)}x${Math.round(size.h)}`;
      if (placed && placed.key === here && !snap) { // a crowded place (nothing is clear) does not follow every scroll of the sheet: the old place stays while it covers about what a new one would
        const mine = { x: placed.x, y: placed.y, w: size.w, h: size.h }, now = coverScore({ x: at.x, y: at.y, w: size.w, h: size.h }, spot, keep), was = coverScore(mine, spot, keep);
        const staysOff = !spot || !rectsOverlap(mine, spot) || rectsOverlap({ x: at.x, y: at.y, w: size.w, h: size.h }, spot); // the old place is not kept when it is over the target and the new one is not
        const buttons = (b) => keep.filter((r) => r.ctl && rectsOverlap(b, r)).length; // nor when it is over more buttons than the new one
        if (now > 0 && was <= now * 1.25 + 400 && staysOff && buttons(mine) <= buttons({ x: at.x, y: at.y, w: size.w, h: size.h })) at = { ...at, x: placed.x, y: placed.y };
      }
      placed = { x: at.x, y: at.y, key: here };
      cardEl.dataset.side = at.side;
      if (spot && cardEl.style.setProperty) { cardEl.style.setProperty('--ac-ax', `${Math.round(spot.x + spot.w / 2 - at.x)}px`); cardEl.style.setProperty('--ac-ay', `${Math.round(spot.y + spot.h / 2 - at.y)}px`); } // where the caret on the card's edge points
      if (snap) { cardEl.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { if (cardEl) cardEl.style.transition = ''; })); } // out of the cursor's way at once, not in .25s
      cardEl.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      cardEl.classList.toggle('lift', true);
    }
    function stepChanged() {
      stepAt = performance.now(); hintOn = false; showMe = false; confirm = false;
      const c = coachFor(m, run);
      manual = satisfiedNow(steps[run.i], { drawer: U.drawer });
      paintCoach(true);
      announce(`${c.finishing ? c.say : `Step ${c.index + 1} of ${c.total}. ${c.say}`}${said ? ` ${said}` : ''}`);
      setTimeout(() => { if (!dead && !gone) ctx.render(); }, 0); // after the click that caused it has been handled
      soon();
    }

    // ---- a lesson that can no longer be finished: asked after every game event (once the action that sent it is over: a Deal Room sends several in a row, and the engine has not
    // finished its change when the first one arrives), whenever a step begins and once a second. The first no swaps the coach card for Restart, a later yes puts the coach back.
    function check() {
      if (dead || gone || sheet || winPending || run.won) return;
      const seen = lookout.look(run);
      if (!seen.changed) return;
      stranded = seen.stranded;
      if (stranded) announce(`${stranded.say} Press Restart to try it again.`, true);
      hintOn = false; showMe = false; confirm = false; lastKey = '';
      ctx.render(); paintCoach(true);
    }
    function soon() { if (checkQ) return; checkQ = true; Promise.resolve().then(() => { checkQ = false; check(); }); }

    // ---- feeding the resolver
    function feed(evt) {
      if (dead || gone || sheet || winPending || run.won) return;
      const r = feedRun(m, run, evt);
      run = r.run;
      if (r.pause) { try { sb.setPaused(true); } catch { /* clock fixed */ } } // a step that says `pause`: the clock stops at the moment the step is done (m07's glut), before the next card is drawn
      if (r.advanced) stepChanged();
      if (r.won) win();
    }
    off.push(ctx.on(feed));
    off.push(ctx.on((evt) => { lookout.note(evt); soon(); }));
    // What the world has under a click: the World's own hit test, so a step that says "tap the van" hears the tap whether or not the world can place a rect.
    const worldHit = (e) => {
      const w = ctx.world?.()?.world, cv = w?.cv;
      if (!w || !cv || typeof w.pick !== 'function' || !cv.contains(e.target)) return null;
      const r = cv.getBoundingClientRect();
      try { return w.pick(e.clientX - r.left, e.clientY - r.top); } catch { return null; }
    };
    const onClick = (e) => {
      const w = steps[run.i]?.wait;
      if (!w || w.type !== 'click' || sheet) return;
      const want = w.anchor, a = parseAnchor(want);
      if (a?.kind === 'dom') { // (the clock's anchor wraps the speed picker, Help and Menu as well: only the Play / Pause button runs time)
        if (e.target.closest?.(`[data-anchor="${want}"]`) && (want !== 'hud-clock' || e.target.closest?.('[data-act="pause"]'))) feed({ type: 'click', anchor: want });
        return;
      }
      if (!a) return;
      const hs = e.target.closest?.('[data-hs]');
      if (hs) { // the keyboard route to a world thing: the list under the world
        const [kind, id] = hs.dataset.hs.split('|');
        if (hitMatches(a, { kind, id, asset: kind === 'asset' ? sb.game.s.assets.find((x) => x.id === id) : null })) feed({ type: 'click', anchor: want });
        return;
      }
      const hit = worldHit(e);
      if (hit) { if (hitMatches(a, hit)) feed({ type: 'click', anchor: want }); return; }
      const res = resolve(want);
      if (res?.via === 'world' && pointInRect(e.clientX, e.clientY, res.rect)) feed({ type: 'click', anchor: want });
    };
    document.addEventListener('click', onClick, true);
    const onKey = (e) => { // C jumps to the coach card (in a window that carries it too)
      if ((e.key !== 'c' && e.key !== 'C') || e.metaKey || e.ctrlKey || e.altKey || sheet || (dlg.el.open && !(cardEl && dlg.el.contains(cardEl))) || e.target.matches?.('input, select, textarea, [contenteditable]')) return;
      [...(cardEl?.querySelectorAll('button') || [])].find((b) => b.getClientRects().length)?.focus(); e.preventDefault(); // the first button the card shows: the tab, when it is folded
    };
    document.addEventListener('keydown', onKey);
    const onResize = () => paintCoach();
    window.addEventListener('resize', onResize);
    // The keyboard landing under the card moves the card (keepRects counts the focused control for most): looked at once, not at the next beat.
    const onFocus = (e) => { if (!cardEl || cardEl.contains(e.target) || e.target.tagName === 'CANVAS') return; paintCoach(false, true); };
    document.addEventListener('focusin', onFocus);
    let raf = 0;
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintCoach(); }); };
    ctx.el.drawer.addEventListener('scroll', later, true); // the drawer's body scrolls (scroll does not bubble, so: capture), and the buttons move under the card
    const mo = new MutationObserver(later);
    for (const e of [ctx.el.hud, ctx.el.tracker, ctx.el.ticker, ctx.el.dock, ctx.el.drawer, ctx.el.world]) mo.observe(e, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    mo.observe(dlg.el, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-pressed'] }); // the hire dialog: a manager picked, the dialog opened or shut

    // ---- the sheets that follow the win
    const stageKids = () => [...ctx.el.stage.children].filter((c) => c !== ctx.el.overlay);
    function openSheet(html, label) {
      layer?.remove();
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.className = 'ac-sheet';
        sheet.innerHTML = '<div class="ac-sheet-in" role="dialog" aria-modal="true" aria-labelledby="ac-sh"></div>';
        sheet.addEventListener('keydown', (e) => {
          if (/^[1-7]$/.test(e.key) || e.key === 'Escape') e.stopPropagation(); // the dock's shortcuts must not fire behind a card
          if (e.key !== 'Tab') return;
          const f = tabStops(sheet, document.activeElement);
          if (!f.length) return;
          const first = f[0], lastEl = f[f.length - 1], on = document.activeElement, away = !f.includes(on); // away: the cursor is on the heading, which the page put it on and Tab never reaches
          if (e.shiftKey && (on === first || away)) { lastEl.focus(); e.preventDefault(); } else if (!e.shiftKey && on === lastEl) { first.focus(); e.preventDefault(); }
        });
        ctx.el.overlay.appendChild(sheet);
        inerted = stageKids(); for (const k of inerted) k.inert = true;
      }
      const inner = sheet.firstChild;
      inner.setAttribute('aria-label', label);
      inner.innerHTML = html;
      countUp(inner, { reduced: reduced() }); // presentation only: the reward's numbers tick up
      $('#ac-sh', inner)?.focus({ preventScroll: true });
      sheet.scrollTop = 0; inner.scrollTop = 0;
    }
    function closeSheet() { for (const k of inerted) k.inert = false; inerted = []; sheet?.remove(); sheet = null; }

    function win() {
      winPending = true;
      try { sb.setPaused(true); } catch { /* clock fixed */ }
      layer?.remove();
      try { sfx.level(); burst({ power: 1.2 }); } catch { /* effects are optional */ }
      announce('Lesson goal reached.');
      ctx.render();
    }
    function showWhy() {
      winPending = false;
      openSheet(whyHTML(m, { skipped, index: idx, total: list.length }), 'Why it worked');
      announce('Why it worked.');
    }
    function showTeach() {
      if (!m.teachBack?.options?.length) { showReward(); return; }
      openSheet(teachHTML(m, teach), 'Teach-back question');
    }
    function showReward() {
      const st = readAcademy(store), replay = st.done.includes(m.id), plan = rewardPlan(m, { done: replay, skipped });
      const info = { id: m.id, tries: teach.picks.length || 1, skipped };
      let paid = { xp: 0, points: 0, newCodex: [], knownCodex: plan.show, pending: false };
      if (plan.grant) {
        const g = real();
        if (g) { paid = { ...applyRewards(g, plan, info, (gm) => new Progress(gm)), pending: false }; try { S.save?.(true); } catch { /* saved at the next step */ } } else { addPending(store, plan, info); paid = { xp: plan.xp, points: plan.points, newCodex: plan.codex, knownCodex: [], pending: true }; }
      }
      markMission(store, list, m.id, { skipped });
      const t = store.get(KEYS.teach) || {};
      store.set(KEYS.teach, { ...t, [m.id]: { tries: teach.picks.length, firstTry: teachFirstTry(teach), revealed: teach.revealed } });
      openSheet(rewardHTML(m, paid, lookup, { last: !!only || idx + 1 >= list.length, only: !!only, skipped, replay, index: idx, total: list.length }), 'Lesson reward');
      if (!replay && !skipped) { try { sfx.level(); burst({ power: 1.4 }); } catch { /* optional */ } }
      announce(`Lesson complete.${paid.xp ? ` Plus ${paid.xp} XP.` : ''}`);
    }
    function skipNow() { skipped = true; winPending = false; try { sb.setPaused(true); } catch { /* fixed */ } layer?.remove(); showWhy(); }

    // ---- actions (added to the shell's own table, so they work in the page and in the dialog)
    Object.assign(ctx.acts, {
      'ac-showme'() { showMe = !showMe; if (showMe) bringIntoView(); paintCoach(true); const c = coachNow(), a = parseAnchor(c.anchor); if (showMe && a?.kind === 'dom' && !ringEl.hidden) domEls(a.name)[0]?.focus?.({ preventScroll: true }); }, // the cursor goes to the control only when a frame is on it
      'ac-skip'() { confirm = true; paintCoach(true); cardEl.querySelector('[data-act="ac-skip-no"]')?.focus(); },
      'ac-skip-no'() { confirm = false; paintCoach(true); cardEl.querySelector('[data-act="ac-skip"]')?.focus(); },
      'ac-skip-yes'() { dlg.close(); skipNow(); },
      'ac-continue'() { const e = manual; manual = null; if (e) feed(e); },
      'ac-restart'() { dlg.close(); play(idx); },
      'ac-leave'() { dlg.close(); leave(); },
      'ac-why-next'() { showTeach(); },
      'ac-pick'(el) { const r = pickTeach(m.teachBack, teach, +el.dataset.i); if (!r.result) return; teach = r.state; openSheet(teachHTML(m, teach), 'Teach-back question'); sheet.querySelector('[data-act="ac-teach-next"], .ac-opt:not([aria-disabled="true"])')?.focus(); announce((r.result.correct ? 'Correct. ' : 'Not quite. ') + r.result.why); },
      'ac-reveal'() { teach = revealTeach(teach); openSheet(teachHTML(m, teach), 'Teach-back question'); },
      'ac-teach-next'() { showReward(); },
      'ac-reward-next'() { closeSheet(); advance(idx); },
      menu() {
        dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>Lesson menu</h2><div class="grid">
          <button class="btn" data-close>Back to the lesson</button><button class="btn ghost" data-act="ac-restart">Restart this lesson</button><button class="btn ghost" data-act="ac-skip-yes">Skip this lesson</button>
          <button class="btn ghost" data-act="settings">Display and sound</button><button class="btn danger" data-act="ac-leave">Leave the Academy</button></div>
          <p class="small mute gap">Nothing in a lesson touches your real run.</p>`, { label: 'Lesson menu' });
      },
    });

    // ---- the Deal Room's folded card: the tab opens it, Fold away (or a press anywhere else in the room) puts it back
    Object.assign(ctx.acts, {
      'ac-expand'() { open = true; paintCoach(true); cardEl.querySelector('[data-act="ac-fold"]')?.focus({ preventScroll: true }); },
      'ac-fold'() { open = false; paintCoach(true); [...cardEl.querySelectorAll('button')].find((b) => b.getClientRects().length)?.focus({ preventScroll: true }); },
    });
    const onAway = (e) => { if (open && cardEl && !cardEl.contains(e.target)) { open = false; paintCoach(true); } }; // after the press has been handled by what it landed on (the listener is on the capture phase of `click`, which only reads)
    document.addEventListener('click', onAway, true);
    dlg.el.addEventListener('scroll', later, true); // the room's sheet scrolls under the card (scroll does not bubble: capture), so the card looks again at once

    // ---- the heartbeat: the sandbox clock, the hint, a card waiting for a dialog to close
    let beats = 0;
    const beat = setInterval(() => {
      if (dead || gone) return;
      try { sb.tick(); } catch (e) { console.error(e); }
      if (++beats % 5 === 0) check();
      if (winPending && !dlg.el.open && !U.queue.length) { showWhy(); return; }
      if (!sheet && !winPending && !run.won) {
        if (!hintOn && hintDue(stepAt, performance.now())) { hintOn = true; announce('Hint: ' + coachFor(m, run).hint); }
        paintCoach();
      }
    }, 200);

    stepChanged();
    return {
      destroy() {
        gone = true; clearInterval(beat); for (const f of off) f();
        document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.removeEventListener('focusin', onFocus);
        mo.disconnect(); if (raf) cancelAnimationFrame(raf); ctx.el.drawer.removeEventListener('scroll', later, true);
        document.removeEventListener('click', onAway, true); dlg.el.removeEventListener('scroll', later, true);
        for (const k of inerted) k.inert = false;
        layer?.remove(); sheet?.remove();
        try { mounted.destroy(); } catch (e) { console.error(e); }
      },
    };
  }

  // ---------------------------------------------------------------- start
  // Rewards from lessons played before a run existed are handed to the run the moment there is one to give them to.
  if (S?.game) { try { if (claimPending(store, S.game, (g) => new Progress(g))) S.save?.(true); } catch (err) { console.error(err); } }
  if (!list.length) { setTimeout(() => finish('done', { completed: 0, finished: false, empty: true }), 0); return cleanupAll; }
  let first = 0;
  if (only) { first = list.findIndex((m) => m.id === only); if (first < 0) { setTimeout(() => finish('done', { completed: 0 }), 0); return cleanupAll; } } else { const n = nextIndex(list, readAcademy(store)); first = n < 0 ? 0 : n; }
  intro(first);
  return cleanupAll;
}
