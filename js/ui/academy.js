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
import { $, esc, delegate, dlg, toast, announce, sfx, burst, reduced } from './common.js';
import { countUp } from './polish.js';
import { kv } from '../session.js';
import { ZONES } from '../config.js';
import { Progress, CODEX_BY_ID } from '../meta/progress.js';
import {
  parseAnchor, resolveAnchor, hitMatches, placeCard, coverOf, pointInRect, startRun, feedRun, coachFor, satisfiedNow, shortSay, hintDue,
  newTeach, pickTeach, revealTeach, teachDone, teachFirstTry, readAcademy, markMission, nextIndex, rewardPlan, applyRewards,
  readPending, addPending, claimPending, codexSeed, emptyMeta, makeSandboxSession, featuresFor, KEYS,
} from './academy-sandbox.js';

let MISSIONS = [];
try { ({ ACADEMY: MISSIONS } = await import('../meta/academy.js')); } catch { /* TEMPORARY: academy.js merges from its own branch; this guard goes at the merge */ }
export const missionList = () => MISSIONS;

let shellP = null;
const loadShell = () => (shellP ||= import('./shell.js')); // loaded when a lesson starts: the intro and the pure parts do not need the whole game screen

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

/** The coach card's inside. o = { showMe, hint (bool), confirm (bool), manual (bool), title }. */
export function coachHTML(c, o = {}) {
  const dots = Array.from({ length: Math.min(12, Math.max(0, c.total | 0)) }, (_, i) => `<i${c.finishing || i <= c.index ? ' class="on"' : ''}></i>`).join('');
  const head = `<div class="ac-head"><small class="ac-eyebrow mono">${esc(o.title || 'Lesson')} &middot; ${c.finishing ? 'Last step' : `Step ${c.index + 1} of ${c.total}`}</small>${dots ? `<span class="ac-dots" aria-hidden="true">${dots}</span>` : ''}</div>`;
  if (o.confirm) {
    return `${head}<p class="ac-say" id="ac-say">Skip this lesson? You will still see why it works and answer one question.</p>
      <div class="ac-btns"><button class="btn sm" data-act="ac-skip-yes">Yes, skip it</button><button class="btn sm ghost" data-act="ac-skip-no">Keep going</button></div>`;
  }
  return `${head}<p class="ac-say" id="ac-say">${esc(c.say)}</p>
    ${o.showMe ? '<p class="ac-look" role="note">It is the control with the gold frame.</p>' : ''}
    ${o.hint ? `<p class="ac-hint" role="note"><b>Hint:</b> ${esc(c.hint)}</p>` : ''}
    <div class="ac-btns">${o.manual ? '<button class="btn sm" data-act="ac-continue">Continue</button>' : ''}<button class="btn sm ghost" data-act="ac-showme" aria-pressed="${!!o.showMe}">Show me</button><button class="btn sm ghost" data-act="ac-skip">Skip lesson</button>${o.hint ? '<button class="btn sm ghost" data-act="ac-restart">Restart</button>' : ''}</div>`;
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
    try { cur = lesson(shell.mountGame, idx); } catch (err) { console.error(err); toast('The lesson could not start. You can leave the Academy and try again later.', 'bad'); intro(idx); }
  }

  function lesson(mountGame, idx) {
    const m = list[idx];
    const pend = readPending(store), meta = { ...emptyMeta(), cx: codexSeed(real()?.s.meta?.cx, pend) };
    const sb = makeSandboxSession(m.setup, { id: m.id, zone: m.zone, handle: S?.handle || 'You', meta });
    const stubs = { onDebrief() {}, onTutorial() {}, onJoin() {}, onReset() {}, onAcademy: () => toast('Finish or leave this lesson first.', 'info') };
    const mounted = mountGame(root, sb, stubs);
    try { return wire(mounted, m, sb, idx); } catch (err) { try { mounted.destroy(); } catch { /* half built */ } throw err; }
  }

  /** The lesson on top of a mounted game screen: coach marks, the step resolver, the sheets, the heartbeat. Returns { destroy }. */
  function wire(mounted, m, sb, idx) {
    const steps = m.steps || [];
    const { ctx } = mounted, U = ctx.U, off = [];
    U.features = Array.isArray(m.setup?.features) ? featuresFor(m) : null;
    U.zone = sb.game.sandbox.zone;
    let run = startRun(m), stepAt = performance.now(), hintOn = false, showMe = false, confirm = false, manual = null, gone = false;
    let sheet = null, teach = newTeach(), skipped = false, winPending = false, lastKey = '', inerted = [];
    let layer = null, ringEl = null, cardEl = null, bodyEl = null; // the card is a frame with a caret on its edge; its text scrolls in bodyEl, so the caret is never clipped

    U.tracker = () => { const c = coachFor(m, run); return { title: m.title, desc: shortSay(c.say), icon: m.icon, p: Math.min(run.i, steps.length), n: steps.length, drawer: null }; };
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

    function ensureLayer() {
      if (layer && layer.isConnected) return;
      layer = document.createElement('div');
      layer.className = 'ac-layer'; layer.dataset.academy = '';
      layer.innerHTML = '<div class="ac-ring" aria-hidden="true" hidden></div><section class="ac-coach" role="dialog" aria-modal="false" aria-labelledby="ac-say" tabindex="-1"><div class="ac-coach-in"></div></section>';
      ringEl = layer.firstChild; cardEl = layer.lastChild; bodyEl = cardEl.firstChild;
      ctx.el.overlay.appendChild(layer);
      lastKey = '';
    }
    function hostFor(res) { const el = res?.anchor?.kind === 'dom' ? domEls(res.anchor.name)[0] : null; return el && dlg.el.open && dlg.el.contains(el) ? dlg.el : ctx.el.overlay; }

    function paintCoach(force) {
      if (dead || gone || sheet || winPending || run.won) return;
      ensureLayer();
      const c = coachFor(m, run), res = resolve(c.anchor), host = hostFor(res);
      if (layer.parentNode !== host) host.appendChild(layer);
      const key = [c.id, hintOn, showMe, confirm, !!manual].join('|');
      if (force || key !== lastKey) {
        lastKey = key;
        const had = cardEl.contains(document.activeElement) ? document.activeElement.dataset.act : null;
        bodyEl.innerHTML = coachHTML(c, { showMe, hint: hintOn, confirm, manual: !!manual, title: m.title });
        if (had) cardEl.querySelector(`[data-act="${had}"]`)?.focus({ preventScroll: true });
      }
      const view = { w: window.innerWidth, h: window.innerHeight };
      const spot = res && res.via !== 'fallback' && coverOf(res.rect, view) < 0.6 ? res.rect : null, pad = 6;
      ringEl.hidden = !spot;
      ringEl.classList.toggle('show', !!spot && showMe);
      if (spot) { ringEl.style.width = spot.w + pad * 2 + 'px'; ringEl.style.height = spot.h + pad * 2 + 'px'; ringEl.style.transform = `translate(${Math.round(spot.x - pad)}px, ${Math.round(spot.y - pad)}px)`; }
      const keep = [ctx.el.drawer.hidden ? null : ctx.el.drawer, ctx.el.dock].filter(Boolean).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
      const box = cardEl.getBoundingClientRect(), at = placeCard(spot, { w: box.width || 320, h: box.height || 150 }, view, 14, 8, keep); // never over the open drawer or the dock icons
      cardEl.dataset.side = at.side;
      if (spot && cardEl.style.setProperty) { cardEl.style.setProperty('--ac-ax', `${Math.round(spot.x + spot.w / 2 - at.x)}px`); cardEl.style.setProperty('--ac-ay', `${Math.round(spot.y + spot.h / 2 - at.y)}px`); } // where the caret on the card's edge points
      cardEl.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      cardEl.classList.toggle('lift', true);
    }
    function stepChanged() {
      stepAt = performance.now(); hintOn = false; showMe = false; confirm = false;
      const c = coachFor(m, run);
      manual = satisfiedNow(steps[run.i], { drawer: U.drawer });
      paintCoach(true);
      announce(c.finishing ? c.say : `Step ${c.index + 1} of ${c.total}. ${c.say}`);
      setTimeout(() => { if (!dead && !gone) ctx.render(); }, 0); // after the click that caused it has been handled
    }

    // ---- feeding the resolver
    function feed(evt) {
      if (dead || gone || sheet || winPending || run.won) return;
      const r = feedRun(m, run, evt);
      run = r.run;
      if (r.advanced) stepChanged();
      if (r.won) win();
    }
    off.push(ctx.on(feed));
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
      if (a?.kind === 'dom') { if (e.target.closest?.(`[data-anchor="${want}"]`)) feed({ type: 'click', anchor: want }); return; }
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
    const onKey = (e) => { // C jumps to the coach card
      if ((e.key !== 'c' && e.key !== 'C') || e.metaKey || e.ctrlKey || e.altKey || sheet || dlg.el.open || e.target.matches?.('input, select, textarea, [contenteditable]')) return;
      cardEl?.querySelector('button')?.focus(); e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    const onResize = () => paintCoach();
    window.addEventListener('resize', onResize);
    let raf = 0;
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintCoach(); }); });
    for (const e of [ctx.el.hud, ctx.el.tracker, ctx.el.ticker, ctx.el.dock, ctx.el.drawer, ctx.el.world]) mo.observe(e, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

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
          const f = [...sheet.querySelectorAll('button:not([aria-disabled="true"]), [tabindex="-1"]')].filter((x) => x.offsetParent !== null || x === document.activeElement);
          if (!f.length) return;
          const first = f[0], lastEl = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { lastEl.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === lastEl) { first.focus(); e.preventDefault(); }
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
      'ac-showme'() { showMe = !showMe; paintCoach(true); const c = coachFor(m, run), a = parseAnchor(c.anchor); if (showMe && a?.kind === 'dom') domEls(a.name)[0]?.focus?.({ preventScroll: true }); },
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

    // ---- the heartbeat: the sandbox clock, the hint, a card waiting for a dialog to close
    const beat = setInterval(() => {
      if (dead || gone) return;
      try { sb.tick(); } catch (e) { console.error(e); }
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
        document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
        mo.disconnect(); if (raf) cancelAnimationFrame(raf);
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
