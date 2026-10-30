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
import { $, esc, delegate, dlg, toast, announce, burst, reduced } from './common.js';
import { countUp } from './polish.js';
import { kv } from '../session.js';
import { ZONES } from '../config.js';
import { Progress, CODEX_BY_ID } from '../meta/progress.js';
import { ACADEMY as MISSIONS } from '../meta/academy.js';
import {
  parseAnchor, resolveAnchor, hitMatches, fitCard, chooseSize, rectsOverlap, coverOf, smallWindow, CONTROL_SELECTOR, HANDLE_SIZE, pointInRect, startRun, feedRun, coachFor, satisfiedNow, shortSay, hintDue,
  newTeach, pickTeach, revealTeach, teachDone, teachFirstTry, readAcademy, markMission, nextIndex, rewardPlan, applyRewards,
  readPending, addPending, claimPending, codexSeed, emptyMeta, makeSandboxSession, featuresFor, KEYS,
  newLookout, hireSnapshot, hireCoach, unseenNote, keepsPlace, rescueButton,
} from './academy-sandbox.js';
import { academySounds } from './academy-sandbox.js';
import { audio as engine } from '../audio/index.js';

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
    <div class="row gap"><button class="btn big" data-act="ac-start">${replay ? 'Replay the lesson' : 'Start the lesson'}</button><button class="btn ghost" data-act="ac-leave">Leave the Academy</button></div>
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
  // The tab says which step it is (or Hint, once the hint is due) and, where the strip gives it the width (css .instrip), the gist: the step's first sentence, or the hint itself, on one line.
  const grab = o.fold ? `<button class="ac-grab" data-act="ac-expand" aria-expanded="false" title="Read the lesson card" aria-label="${esc(`Lesson card, ${step}${o.hint ? ', with a hint' : ''}. Open it to read.`)}"><b class="ac-gl">${o.hint ? 'Hint' : c.finishing ? 'Last step' : `Step ${c.index + 1} of ${c.total}`}</b><span class="ac-gt">${esc(o.hint ? c.hint : shortSay(c.say, 110))}</span></button>` : '';
  const foldBtn = o.fold && o.open ? '<button class="btn sm ghost" data-act="ac-fold" aria-expanded="true">Fold away</button>' : '';
  const look = !o.showMe ? '' : framed ? 'It is the control with the gold frame.' : o.clipped ? 'It is lower down this panel.' : o.exists ? 'It is too big for a frame: it covers most of the screen.' : 'Nothing to frame yet.';
  return `${head}${grab}<p class="ac-say" id="ac-say">${esc(c.say)}</p>
    ${o.where ? `<p class="ac-where" role="note">${esc(o.where)}</p>` : ''}${look ? `<p class="ac-look" role="note">${esc(look)}</p>` : ''}
    ${o.hint ? `<p class="ac-hint" role="note"><b>Hint:</b> ${esc(c.hint)}</p>` : ''}
    <div class="ac-btns">${o.manual ? '<button class="btn sm" data-act="ac-continue">Continue</button>' : ''}<button class="btn sm ghost" data-act="ac-showme" aria-pressed="${!!o.showMe}">Show me</button><button class="btn sm ghost" data-act="ac-skip">Skip lesson</button>${o.hint ? '<button class="btn sm ghost" data-act="ac-restart">Restart</button>' : ''}${foldBtn}</div>`;
}

/** The coach card when the lesson can no longer be finished (c = { say, hint } from strandedFor): what happened, then Restart as the one primary button. It folds to its tab like any card (`fold`), and `open` adds Fold away. */
export function strandedHTML(c, o = {}) {
  const grab = o.fold ? `<button class="ac-grab" data-act="ac-expand" aria-expanded="false" title="Read the lesson card" aria-label="Lesson card, closed early. Open it to read."><b class="ac-gl">Closed early</b><span class="ac-gt">${esc(shortSay(c.say, 110))}</span></button>` : '';
  const foldBtn = o.fold && o.open ? '<button class="btn sm ghost" data-act="ac-fold" aria-expanded="true">Fold away</button>' : '';
  return `<div class="ac-head"><small class="ac-eyebrow mono">${esc(o.title || 'Lesson')} &middot; Closed early</small></div>${grab}
    <p class="ac-say" id="ac-say">${esc(c.say)}</p>
    <p class="ac-lost">${esc(c.hint)}</p>
    <div class="ac-btns"><button class="btn sm" data-act="ac-restart" data-fid="ac-restart">Restart</button><button class="btn sm ghost" data-act="ac-skip">Skip lesson</button>${foldBtn}</div>`;
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
    $('#ac-h', root)?.focus({ preventScroll: true }); // the heading is where the cursor goes (it is read out); go() has already focused the page, so an `autofocus` on the button was ignored and logged "Autofocus processing was blocked"
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
    // Sound (docs/AUDIO.md 4.3): what each moment plays is academySounds (./academy-sandbox.js, pure). The engine is the drawer context's when the shell gives one, else the page's. Guarded: a lesson never breaks for sound.
    const hear = (what, d) => { try { const a = ctx.audio && typeof ctx.audio.play === 'function' ? ctx.audio : engine; for (const [id, o] of academySounds(what, d)) { if (id === 'countUp') a.countUp?.(o.xp); else a.play(id, o); } } catch { /* sound is optional */ } };

    let layer = null, ringEl = null, cardEl = null, bodyEl = null, stripEl = null, stripOn = false; // the card is a frame with a caret on its edge; its text scrolls in bodyEl, so the caret is never clipped

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
      layer.innerHTML = '<div class="ac-ring" aria-hidden="true" hidden></div><i class="ac-stripbox" aria-hidden="true"></i><section class="ac-coach" role="dialog" aria-modal="false" aria-labelledby="ac-say" tabindex="-1"><div class="ac-coach-in"></div></section>';
      ringEl = layer.firstChild; stripEl = layer.children[1]; cardEl = layer.lastChild; bodyEl = cardEl.firstChild;
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
    // What the card must not hide, as { x, y, w, h, wt, ctl, focus }: EVERY control of what the player can reach (the HUD's buttons, the tracker, the news line, the camera and list buttons, the dock, the open panel's title bar, its Close button, its tabs
    // and everything in its body, and, inside a window, all of its own), each cut to the part of it that can be seen (a panel's body scrolls, so a control scrolled out of it counts for nothing), then the control the keyboard is on above
    // all (a card over it hides the cursor itself). All of them are `ctl`: a card is shown only where it touches none (chooseSize), and where there is no such place it is its tab. What a lesson asks the player to READ
    // (the seller's reply, the stage's result line), the open panel and a window's title bar are not controls: they count for less, so the card prefers the empty part of the stage and stands over them only where nothing is emptier.
    const READ = '.deal .bubble, .deal-stage .callout, .deal-result .rhead, .deal-result .rlines, .deal-score > div';
    const clipMemo = new Map();
    function clipOf(a) { // the part of an ancestor's box that clips its descendants (a scroller, a hidden overflow), or null when it clips nothing; once per ancestor in a pass
      if (clipMemo.has(a)) return clipMemo.get(a);
      const cs = getComputedStyle(a); let c = null;
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = a.getBoundingClientRect(), l = b.left + a.clientLeft, t = b.top + a.clientTop; c = { x0: l, y0: t, x1: l + a.clientWidth, y1: t + a.clientHeight }; }
      clipMemo.set(a, { c, fixed: cs.position === 'fixed' });
      return clipMemo.get(a);
    }
    function seenBox(e, view) { // what can be seen of an element: its box cut to the window and to every ancestor that clips, up to a fixed box
      const r = e.getBoundingClientRect();
      let x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0), x1 = Math.min(r.right, view.w), y1 = Math.min(r.bottom, view.h);
      for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
        const k = clipOf(a);
        if (a !== e && k.c) { x0 = Math.max(x0, k.c.x0); y0 = Math.max(y0, k.c.y0); x1 = Math.min(x1, k.c.x1); y1 = Math.min(y1, k.c.y1); }
        if (k.fixed || x1 <= x0 || y1 <= y0) break;
      }
      return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }
    function keepRects(host, view) {
      const out = [], inDlg = host === dlg.el, root = inDlg ? host : ctx.el.stage;
      const add = (e, wt, pad = 0, focus = false, ctl = false) => {
        if (!e || e === cardEl || layer?.contains(e) || !e.isConnected) return;
        const r = seenBox(e, view);
        if (r) out.push({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2, wt, focus, ctl });
      };
      clipMemo.clear();
      const shown = (e) => { try { return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch { return e.offsetWidth > 0 || e.offsetHeight > 0; } };
      for (const e of root.querySelectorAll(CONTROL_SELECTOR)) {
        if (layer?.contains(e) || e.tagName === 'CANVAS' || e.matches(':disabled') || e.closest('[inert]') || !shown(e)) continue;
        add(e, 2, 0, false, true);
      }
      if (inDlg) { add(host.querySelector('.deal-top'), 1); for (const e of host.querySelectorAll(READ)) add(e, 0.4); }
      else if (!ctx.el.drawer.hidden) add(ctx.el.drawer, 3);
      const f = document.activeElement;
      if (f && f !== document.body && f !== document.documentElement && f.tagName !== 'CANVAS' && !cardEl?.contains(f)) { // the world's canvas is the whole window: it is never "covered"
        const r = f.getBoundingClientRect();
        if (r.width * r.height < view.w * view.h * 0.4) add(f, 1000, 7, true, true); // 7px: the ring is 3px wide and drawn 2px out. Weighed past everything else together: a card that hides the cursor is wrong wherever else it lands
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

    // A press in flight. The card does not move, change shape or change its words while a finger or a mouse button is down: pressing a control moves the cursor to it (focusin), the cursor is the first
    // thing the card keeps off, and a card that hops over the control being pressed takes the release (the hire dialog's Student card: the one-line bar at the foot grew to the full card over it, the
    // release landed on the card, and the dialog closed on a click whose target was itself). A touch's click is made a moment AFTER the finger is up (touchend, then the mouse events of the tap), so the
    // card also holds for `CLICK_GRACE` after a release, or until the click itself comes: the capture listener of `click` lifts the hold before the handlers that follow, which paint as they always did. What was
    // owed is painted then. A press that never ends (a button let go outside the window) is forgotten after `PRESS_MAX`.
    const PRESS_MAX = 4000, CLICK_GRACE = 350;
    let pressing = false, owed = false, pressAt = 0, graceTo = 0, graceT = 0;
    const holding = () => pressing || Date.now() < graceTo;
    const thaw = () => { graceTo = 0; clearTimeout(graceT); if (owed && !pressing) { owed = false; if (!dead && !gone && !sheet) paintCoach(); } };
    const pressDown = () => { pressing = true; pressAt = Date.now(); graceTo = 0; clearTimeout(graceT); };
    const pressUp = () => { if (!pressing) return; pressing = false; graceTo = Date.now() + CLICK_GRACE; clearTimeout(graceT); graceT = setTimeout(thaw, CLICK_GRACE + 20); };
    const pressClick = () => { pressing = false; thaw(); };
    const PRESS_ON = ['pointerdown', 'mousedown', 'touchstart'], PRESS_OFF = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel', 'dragend', 'contextmenu'];
    for (const t of PRESS_ON) document.addEventListener(t, pressDown, { capture: true, passive: true });
    for (const t of PRESS_OFF) document.addEventListener(t, pressUp, { capture: true, passive: true });
    document.addEventListener('click', pressClick, true);
    window.addEventListener('blur', pressUp);
    let placed = null; // where the card stands: { x, y, key } (a crowded dialog keeps a place that is still about as good, see the end of paintCoach)
    let said = ''; // what the card says about a thing it cannot frame (unseenNote), kept for the announcement a new step makes
    let open = false, openFor = '', foldedSaid = '', unfold = 0, held = '', homeNow = ''; // the card folded to its tab and opened by the player: it stays open until Fold away, a press elsewhere or the next step (openFor); foldedSaid: the step and window the fold was last announced for; unfold: beats a card that would stand clear has waited since the fold; held: the `home` the player put the card away in: it stays a tab there (a card put away does not come back by itself because the cursor moved off a control); homeNow: the home it is painted for
    const docEl = document.documentElement;
    // The strip (css/ui-academy.css): in a small window the layout keeps the bottom gutter deeper for as long as a lesson is on screen, and the card's tab stands in it, where nothing else can be. The shell measures where its pieces
    // are by their SIZES, and a deeper gutter moves them without resizing any, so it is asked to measure again.
    function setStrip(on) { if (on === stripOn) return; stripOn = on; docEl.classList.toggle('ac-strip', on); try { ctx.relayout?.(); } catch (e) { console.error(e); } }
    function paintCoach(force, snap) {
      if (dead || gone || sheet || winPending || run.won) return;
      if (pressing && Date.now() - pressAt > PRESS_MAX) pressing = false;
      if (holding() && layer?.isConnected) { owed = true; return; } // a press is in flight: see above
      ensureLayer();
      const view = { w: window.innerWidth, h: window.innerHeight };
      setStrip(smallWindow(view, parseFloat(getComputedStyle(docEl).fontSize) || 16));
      const c = coachNow(), found = c.stranded ? null : resolve(c.anchor), host = hostFor();
      const res = host === dlg.el && !inDialog(found) ? null : found; // the step's own thing is not in the sheet that has the card: nothing to ring
      if (layer.parentNode !== host) host.appendChild(layer);
      const clipped = res?.via === 'dom' && !fullyShown(res); // a control of the drawer's body that has scrolled out of it: a frame would stand on the dock or off the window, and dim all of it
      const spot = res && res.via !== 'fallback' && !clipped && coverOf(res.rect, view) < 0.6 ? res.rect : null, pad = 6;
      const exists = !!res && res.via !== 'fallback'; // on screen and reachable, framed or (a whole panel) too big to frame
      const modal = modalKind(), where = c.stranded ? '' : unseenNote(c.anchor, c.wait, { exists, clipped, modal, drawer: !ctx.el.drawer.hidden, deal: modal === 'deal' ? dealOf?.() : null });
      said = where;
      // The card may fold to its tab wherever it is (a window, a panel, the plain game screen): a card is shown only where it touches no control, and where there is no such place it is the tab. Not the card that asks
      // "Skip this lesson?": the player has just pressed Skip lesson, and the question stays where the answer is.
      const foldable = !confirm;
      const home = `${c.id}|${host === dlg.el ? modal : 'page'}|${ctx.U.drawer || ''}`; // what the player opened the card for: this step, in this window or panel
      if (openFor !== home) { open = false; openFor = home; unfold = 0; held = ''; }
      homeNow = home;
      const key = [c.id, c.stranded || c.inDialog ? c.say : '', hintOn, showMe, confirm, !!manual, where, spot ? 1 : 0, exists ? 1 : 0, clipped ? 1 : 0].join('|') + (foldable ? (open ? '|open' : '|fold') : '');
      if (force || key !== lastKey) {
        const news = key !== lastKey && c.inDialog; // the dialog's words are spoken once, when they change
        lastKey = key;
        const had = cardEl.contains(document.activeElement) ? document.activeElement.dataset.act : null;
        bodyEl.innerHTML = c.stranded && !confirm ? strandedHTML(c, { title: m.title, fold: foldable, open: foldable && open, hint: hintOn, finishing: false }) : coachHTML(c, { showMe, hint: hintOn, confirm, manual: !!manual, title: m.title, where, framed: !!spot, exists, clipped, fold: foldable, open: foldable && open });
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
      const TIERS = { full: '', slim: 'slim', narrow: 'slim narrow', handle: 'handle' }; // slim: the words and the hint without the notes; narrow: slim in a column 15rem wide; handle: a one-line tab that opens the card
      const tier = () => (cardEl.classList.contains('handle') ? 'handle' : cardEl.classList.contains('narrow') ? 'narrow' : cardEl.classList.contains('slim') ? 'slim' : 'full'), was = tier();
      const strip = stripOn && stripEl ? { h: stripEl.getBoundingClientRect().height } : null;
      const OPEN = { wide: 'wide', wideslim: 'wide slim' }; // the card the player opened, in a short window: the same words across the strip's width (OPEN_SIZES)
      const setTier = (t) => { for (const k of ['slim', 'narrow', 'handle', 'wide']) cardEl.classList.toggle(k, (TIERS[t] ?? OPEN[t]).split(' ').includes(k)); cardEl.classList.toggle('instrip', t === 'handle' && !!strip); }; // instrip: the tab in the strip has the strip's width, and says what the step says
      // The card is placed at its full size first, then at each smaller size while the place it would take is over the control the keyboard is on, the control the step names or any control at all (every button, link and field of
      // the screen or of the window that is open: a tap that lands on the card is lost). The first size that is clear wins, and every size shows the step's words and, once it is due, the hint. Where no size is clear the card is
      // its tab (`chooseSize`), which stands in the strip in a small window and in a clear place of its own in a large one; the player opens it with a tap or the key C, and it is the full card, wherever it covers least,
      // until Fold away, a press anywhere else or the next step. What a smaller card drops (the notes under the words) was read out when it arrived and is there again, in full, the moment nothing is under the card.
      const fit = (t) => { setTier(t); return fitCard(t, sizeOf(), spot, view, keep, strip, t !== HANDLE_SIZE && bodyEl.scrollHeight > bodyEl.clientHeight + 1); }; // cut: the words of this shape scroll inside it
      let pick = held === home && foldable && !open ? fit(HANDLE_SIZE) : chooseSize(fit, { handle: foldable && !open, narrow: true, words: foldable && open });
      if (pick.t === HANDLE_SIZE) unfold = 0;
      else if (was === 'handle' && !force && !snap && !open && foldable && unfold < 2) { unfold++; pick = fit(HANDLE_SIZE); } // a card that would stand clear after a fold waits two beats, so a sheet that is scrolling does not make it flicker between the two
      setTier(pick.t);
      let size = pick.s, at = pick.p;
      if (tier() !== was) snap = true;
      { // the key that was under the player's finger may be hidden by the smaller card now (display: none drops the cursor): it goes to the first button the card still shows, and a fold is said once a step
        rescueButton(cardEl, document.activeElement)?.focus({ preventScroll: true });
        if (tier() === 'handle' && foldedSaid !== home) { foldedSaid = home; announce('The lesson card is folded to a tab so it does not cover the buttons. Press C, then Enter, to open it.'); }
      }
      const here = `${c.id}|${host === dlg.el ? 'dlg' : 'page'}|${Math.round(size.w)}x${Math.round(size.h)}`;
      if (placed && placed.key === here && !snap && keepsPlace(placed, at, size, spot, keep)) at = { ...at, x: placed.x, y: placed.y }; // a crowded place (nothing is clear: the card the player opened) does not follow every scroll of the sheet: the old place stays while it covers about what a new one would
      placed = { x: at.x, y: at.y, key: here };
      cardEl.dataset.side = at.side;
      if (spot && cardEl.style.setProperty) { cardEl.style.setProperty('--ac-ax', `${Math.round(spot.x + spot.w / 2 - at.x)}px`); cardEl.style.setProperty('--ac-ay', `${Math.round(spot.y + spot.h / 2 - at.y)}px`); } // where the caret on the card's edge points
      if (snap) { cardEl.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { if (cardEl) cardEl.style.transition = ''; })); } // out of the cursor's way at once, not in .25s
      cardEl.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      cardEl.classList.toggle('lift', true);
      toastsYield(host === dlg.el ? null : { x: at.x, y: at.y, w: size.w, h: size.h });
    }
    // A toast gives way to the card. Toasts are over the game for four seconds ("Liability added", "Drew $600") and stand above the card, which is in the stage: at the start of a step, which is when they
    // come, they covered its words and its buttons (844x390: three quarters of the words; 360x640: most of the buttons), in a band the HUD, the drawer and the dock leave nowhere else for either to stand.
    // The lesson's words outrank a passing line, which is read out in the live region and kept in the ledger whatever happens to it, so a toast under the card is let go dim (`ac-under`, css/ui-academy.css)
    // and is seen again if the card moves off it. A toast that says an action failed (`bad`) is never dimmed: that is the one the player needs. A card in a window is over no toast.
    function toastsYield(box) {
      const list = document.querySelectorAll('#toasts .toast');
      for (const t of list) {
        const r = box && !t.classList.contains('bad') ? t.getBoundingClientRect() : null, under = !!r && rectsOverlap(box, { x: r.x, y: r.y, w: r.width, h: r.height });
        if (t.classList.contains('ac-under') !== under) t.classList.toggle('ac-under', under);
      }
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
      if (stranded) { announce(`${stranded.say} Press Restart to try it again.`, true); hear('stranded'); }
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
      if (r.advanced) { stepChanged(); if (!r.won) hear('step', { i: run.i }); } // the goal has its own sound
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
    const toastBox = document.getElementById('toasts'); // a toast comes and goes: the card looks again (the box is not part of the stage)
    if (toastBox) mo.observe(toastBox, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

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
      const counted = countUp(inner, { reduced: reduced() }); // presentation only: the reward's numbers tick up
      $('#ac-sh', inner)?.focus({ preventScroll: true });
      sheet.scrollTop = 0; inner.scrollTop = 0;
      return counted;
    }
    function closeSheet() { for (const k of inerted) k.inert = false; inerted = []; sheet?.remove(); sheet = null; }

    function win() {
      winPending = true;
      try { sb.setPaused(true); } catch { /* clock fixed */ }
      layer?.remove();
      hear('win'); try { burst({ power: 1.2 }); } catch { /* effects are optional */ }
      announce('Lesson goal reached.');
      ctx.render();
    }
    function showWhy() {
      winPending = false;
      openSheet(whyHTML(m, { skipped, index: idx, total: list.length }), 'Why it worked'); hear('page', { late: true }); // after the window that won the lesson has been put away
      announce('Why it worked.');
    }
    function showTeach() {
      if (!m.teachBack?.options?.length) { showReward(); return; }
      openSheet(teachHTML(m, teach), 'Teach-back question'); hear('page');
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
      const counted = openSheet(rewardHTML(m, paid, lookup, { last: !!only || idx + 1 >= list.length, only: !!only, skipped, replay, index: idx, total: list.length }), 'Lesson reward');
      hear('reward', { first: !replay && !skipped, graduate: !only && idx + 1 >= list.length, newCodex: (paid.newCodex || []).length }); // the last lesson of a run through the Academy is the graduation
      if (counted) hear('count', { xp: paid.xp }); // the numbers are counting up (the engine keeps ui.count-up for a quiet moment)
      if (!replay && !skipped) { try { burst({ power: 1.4 }); } catch { /* optional */ } }
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
      'ac-pick'(el) { const r = pickTeach(m.teachBack, teach, +el.dataset.i); if (!r.result) return; teach = r.state; openSheet(teachHTML(m, teach), 'Teach-back question'); hear(r.result.correct ? 'right' : 'wrong'); sheet.querySelector('[data-act="ac-teach-next"], .ac-opt:not([aria-disabled="true"])')?.focus(); announce((r.result.correct ? 'Correct. ' : 'Not quite. ') + r.result.why); },
      'ac-reveal'() { teach = revealTeach(teach); openSheet(teachHTML(m, teach), 'Teach-back question'); hear('reveal'); },
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
      'ac-expand'() { open = true; held = ''; paintCoach(true); cardEl.querySelector('[data-act="ac-fold"]')?.focus({ preventScroll: true }); },
      'ac-fold'() { open = false; held = homeNow; paintCoach(true); [...cardEl.querySelectorAll('button')].find((b) => b.getClientRects().length)?.focus({ preventScroll: true }); },
    });
    const onAway = (e) => { if (open && cardEl && !cardEl.contains(e.target)) { open = false; held = homeNow; paintCoach(true); } }; // after the press has been handled by what it landed on (the listener is on the capture phase of `click`, which only reads)
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
        if (!hintOn && hintDue(stepAt, performance.now())) { hintOn = true; announce('Hint: ' + coachFor(m, run).hint); if (!stranded) hear('hint'); /* the Restart card has its words already */ }
        paintCoach();
      }
    }, 200);

    hear('start'); // the coach card appears
    stepChanged();
    // A seam for scripts/academy-sweep.mjs and the card tests: a page that sets pc.acProbe is handed the lesson's handles, to put the card in any state without playing the lesson to it. Nothing in the game sets it.
    try {
      globalThis.pc?.acProbe?.({
        ctx, sb, mission: m, steps: steps.length,
        goto(i) { run = { ...run, i: Math.max(0, Math.min(steps.length, i | 0)), won: false }; stranded = null; open = false; placed = null; lastKey = ''; stepChanged(); },
        set(o = {}) { if ('hint' in o) hintOn = !!o.hint; if ('confirm' in o) confirm = !!o.confirm; if ('showMe' in o) showMe = !!o.showMe; if ('stranded' in o) stranded = o.stranded || null; if ('open' in o) open = !!o.open; lastKey = ''; },
        paint(fresh) { if (fresh) placed = null; lastKey = ''; owed = false; pressing = false; graceTo = 0; paintCoach(true, !!fresh); },
        target() { const c = coachNow(), f = c.stranded ? null : resolve(c.anchor), r = hostFor() === dlg.el && !inDialog(f) ? null : f; return r ? { via: r.via, rect: r.rect, anchor: c.anchor } : { via: null, rect: null, anchor: c.anchor }; }, // as paintCoach takes it: a thing behind the window is not one
        state() { return { i: run.i, hint: hintOn, confirm, showMe, stranded: !!stranded, open, id: coachNow().id }; },
        card: () => cardEl,
      });
    } catch (e) { console.error(e); }
    return {
      destroy() {
        gone = true; clearInterval(beat); for (const f of off) f();
        document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.removeEventListener('focusin', onFocus);
        mo.disconnect(); if (raf) cancelAnimationFrame(raf); ctx.el.drawer.removeEventListener('scroll', later, true);
        document.removeEventListener('click', onAway, true); dlg.el.removeEventListener('scroll', later, true);
        toastsYield(null); docEl.classList.remove('ac-strip');
        for (const t of PRESS_ON) document.removeEventListener(t, pressDown, true);
        for (const t of PRESS_OFF) document.removeEventListener(t, pressUp, true);
        document.removeEventListener('click', pressClick, true); window.removeEventListener('blur', pressUp); clearTimeout(graceT);
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
